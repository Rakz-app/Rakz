// THIS FILE IS TEMP TILL WE GET THE PARSER SO THAT WE DON'T KEEP GETTING ERRORS IN THE TYPESCRIPT FILES

// ========== 1. IMPORTS ==========
// (No external imports needed for pure type definitions)

// ========== 2. TYPES ==========

type MemonicType =
  | "shortcut"
  | "story"
  | "song"
  | "rule"
  | "fact"
  | "example"
  | "question"
  | "tip"
  | (string & {});

type MemonicImportance = 1 | 2 | 3 | 4 | 5;

type MemonicStatus = "active" | "inactive" | "1" | "0";

interface Link { 
  title : string;
  targetSID : number; 
}

interface Memonic {
  id: string; 
  title: string;
  type: MemonicType;
  context: string;
  importance: MemonicImportance;
  status: MemonicStatus;
  sid: number; 
  tags: string[]; 
  links : Link[];
}

interface MnemoDocument {
  schemaVersion: string;
  memonics: Memonic[];
  hierarchy: string[];
  root : string; 
}

// ========== 3. CONSTANTS ==========
// (Empty for this file)

// ========== 4. STATE ==========
// (Empty for this file)

// ========== 5. LOGIC ==========
// (Empty for this file)

// ========== 6. MAIN / EXPORTS ==========
export type {
  MemonicType,
  MemonicImportance,
  MemonicStatus,
  Memonic,
  Link,
  MnemoDocument
};
