import fs from 'fs';
import path from 'path';

export default function Home() {
  return null;
}

export async function getServerSideProps({ res }) {
  const html = fs.readFileSync(
    path.join(process.cwd(), 'public', 'index.html'),
    'utf-8'
  );
  res.setHeader('Content-Type', 'text/html');
  res.write(html);
  res.end();
  return { props: {} };
}
