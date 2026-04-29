// Convert words to vectors and back
class TextProcessor {
  constructor(vocabularySize = 100) {
    this.vocabularySize = vocabularySize;
    this.wordToIndex = {};
    this.indexToWord = {};
    this.vocabSize = 0;
  }

  // Build vocabulary from text samples
  buildVocabulary(texts) {
    const wordFreq = {};
    texts.forEach(text => {
      const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      words.forEach(word => {
        if (word.length > 1) wordFreq[word] = (wordFreq[word] || 0) + 1;
      });
    });
    
    // Sort by frequency, take top N
    const sorted = Object.entries(wordFreq).sort((a, b) => b[1] - a[1]);
    this.wordToIndex = {};
    this.indexToWord = {};
    
    sorted.slice(0, this.vocabularySize - 1).forEach(([word], i) => {
      this.wordToIndex[word] = i;
      this.indexToWord[i] = word;
    });
    
    this.vocabSize = Object.keys(this.wordToIndex).length;
  }

  // Convert text to vector (bag of words)
  textToVector(text, vectorSize = 50) {
    const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
    const vector = new Array(vectorSize).fill(0);
    
    words.forEach((word, pos) => {
      const idx = this.wordToIndex[word];
      if (idx !== undefined) {
        vector[idx % vectorSize] += 1 / (pos + 1); // Position-weighted
      }
    });
    
    // Normalize
    const max = Math.max(...vector, 1);
    return vector.map(v => v / max);
  }

  // Get available words
  getWords() {
    return Object.keys(this.wordToIndex);
  }
}

module.exports = { TextProcessor };
