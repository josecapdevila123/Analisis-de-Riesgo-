const fs = require('fs');
const content = fs.readFileSync('src/App.tsx', 'utf-8');

// Basic parser to find unclosed JSX tags
let stack = [];
let i = 0;
while (i < content.length) {
  if (content.substring(i, i + 2) === '</') {
    let end = content.indexOf('>', i);
    let tag = content.substring(i + 2, end).trim();
    if (stack.length > 0 && stack[stack.length - 1].tag === tag) {
      stack.pop();
    } else {
      console.log("Unexpected closing tag", tag, "at index", i);
    }
    i = end + 1;
  } else if (content[i] === '<' && content[i+1] !== '/' && content[i+1] !== '!' && content[i+1] !== '?' && !content.substring(i, i+10).match(/^<[A-Z0-9]/i) === false) {
    let end = content.indexOf('>', i);
    let tagStr = content.substring(i + 1, end);
    let tag = tagStr.split(/[\s>]/)[0];
    if (tag && !tagStr.endsWith('/')) {
      stack.push({tag, index: i});
    }
    i = end + 1;
  } else {
    i++;
  }
}

console.log("Unclosed tags:", stack.map(s => s.tag));
