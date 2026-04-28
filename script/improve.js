// scripts/improve.js
const fs = require("fs");
const { execSync } = require("child_process");
const { callModel } = require("../lib/model");

const CHAT_FILE = "pages/api/chat.js";
const STATE_FILE = "lib/state.json";

async function main() {
  // Load current code and learning state
  const currentCode = fs.readFileSync(CHAT_FILE, "utf-8");
  const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8") || "{}");
  const failurePatterns = state.failures || [];
  const successPatterns = state.successes || [];

  // Build a prompt that learns from history
  const history = failurePatterns.length > 0
    ? `Previously, these ideas caused bugs, AVOID them: ${failurePatterns.join("; ")}`
    : "No problematic patterns yet.";

  const prompt = `You are an expert JavaScript developer improving a chatbot API.
Current code:
\`\`\`javascript
${currentCode}
\`\`\`

${history}
Based on this, suggest ONE small, safe improvement to the code (e.g., better error handling, memory, or performance).
Return ONLY valid JavaScript code (no explanation) as a new version of the entire file.`;

  // Ask the AI
  const messages = [
    { role: "system", content: "You output only valid JavaScript code, nothing else." },
    { role: "user", content: prompt }
  ];
  let improvedCode;
  try {
    improvedCode = await callModel(messages);
  } catch (err) {
    console.error("Model call failed:", err.message);
    return;
  }

  // Clean up (remove markdown fences if any)
  improvedCode = improvedCode.replace(/```javascript|```/g, "").trim();

  // Save a backup and apply the change
  const backup = currentCode;
  fs.writeFileSync(CHAT_FILE, improvedCode);

  // Test: try to load the module syntactically (no server start needed)
  let testPassed = false;
  try {
    // We just check that Node can parse it and a simple import works
    require.resolve("../pages/api/chat.js"); // doesn't execute fully, so we also do:
    execSync(`node -e "require('${process.cwd()}/pages/api/chat.js')"`, {
      timeout: 5000,
      stdio: "pipe",
    });
    testPassed = true;
  } catch (e) {
    console.error("Test failed:", e.message);
    // Revert!
    fs.writeFileSync(CHAT_FILE, backup);
    // Log the failure pattern (e.g., what the AI tried)
    const whatWentWrong = extractDescription(e.message, improvedCode);
    failurePatterns.push(whatWentWrong);
    state.failures = failurePatterns;
    console.log("Reverted. Recorded failure pattern.");
  }

  // If success, record timestamp and pattern
  if (testPassed) {
    const hour = new Date().getUTCHours();
    const successEntry = `Improvement at hour ${hour}: ${improvedCode.slice(0, 50)}...`;
    successPatterns.push(successEntry);
    state.successes = successPatterns;
    state.lastStableHour = (state.stableHours || []).concat(hour);
    console.log("Improvement applied and tested successfully.");
  }

  // Save updated state
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function extractDescription(error, code) {
  // Simple extraction – in a real system you'd have more detail
  return error.split("\n")[0];
}

main();
