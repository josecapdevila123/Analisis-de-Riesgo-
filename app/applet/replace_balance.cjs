const fs = require('fs');

const code = fs.readFileSync('src/App.tsx', 'utf-8');

// We need to inject the import
let updatedCode = code;
if (!updatedCode.includes('import { ComparativeView }')) {
  updatedCode = updatedCode.replace(
    'import React, { useState, useCallback, useEffect } from \'react\';',
    'import React, { useState, useCallback, useEffect } from \'react\';\nimport { ComparativeView } from \'./components/ComparativeView\';'
  );
}

const findTabBlock = (codeStr, tabName) => {
  const marker = `{activeTab === '${tabName}' && (`;
  const startIndex = codeStr.indexOf(marker);
  if (startIndex === -1) return null;
  
  let openBrackets = 0;
  let inString = false;
  let stringChar = '';
  
  // start matching immediately after the first '{' for the expression block
  let startBracket = startIndex;
  
  for (let i = startBracket; i < codeStr.length; i++) {
    const char = codeStr[i];
    
    if (!inString && (char === '"' || char === "'" || char === "`")) {
      inString = true;
      stringChar = char;
      continue;
    }
    
    if (inString && char === stringChar && codeStr[i-1] !== '\\') {
      inString = false;
      continue;
    }
    
    if (!inString) {
      if (char === '{') openBrackets++;
      if (char === '}') {
        openBrackets--;
        if (openBrackets === 0) {
          return { start: startIndex, end: i + 1 };
        }
      }
    }
  }
  return null;
};

const mainTab = findTabBlock(updatedCode, 'Balance y Ratios');
if (mainTab) {
  const replacement = `{activeTab === 'Balance y Ratios' && (
                      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                        <ComparativeView />
                      </div>
                    )}`;
  updatedCode = updatedCode.slice(0, mainTab.start) + replacement + updatedCode.slice(mainTab.end);
} else {
  console.log("Could not find main activeTab block");
}

fs.writeFileSync('src/App.tsx', updatedCode);
console.log("Replaced successfully.");
