import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

interface RecentFileSelection {
  regionName: string; // "all" or region's symbol.name
  timestamp: number;
}

export interface RecentSelectionsData {
  version: 1;
  selections: Record<string, RecentFileSelection>;
}

const HTTPYAC_DIR = '.httpyac';
const RECENT_FILE_NAME = 'recent.json';

function getRecentFilePath(): string {
  return join(homedir(), HTTPYAC_DIR, RECENT_FILE_NAME);
}

function getHttpyacDir(): string {
  return join(homedir(), HTTPYAC_DIR);
}

function createEmptyData(): RecentSelectionsData {
  return {
    version: 1,
    selections: {},
  };
}

export async function loadRecentSelections(): Promise<RecentSelectionsData> {
  const filePath = getRecentFilePath();
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(content) as RecentSelectionsData;
    if (data.version === 1 && data.selections) {
      return data;
    }
    return createEmptyData();
  } catch {
    return createEmptyData();
  }
}

export async function saveRecentSelections(data: RecentSelectionsData): Promise<void> {
  const dirPath = getHttpyacDir();
  const filePath = getRecentFilePath();
  try {
    // Ensure ~/.httpyac directory exists
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // Silently fail - don't interrupt the user's workflow
  }
}

export function getRecentSelection(data: RecentSelectionsData, filePath: string): string | undefined {
  // Use absolute path as key for global uniqueness
  return data.selections[filePath]?.regionName;
}

export function setRecentSelection(data: RecentSelectionsData, filePath: string, regionName: string): void {
  // Use absolute path as key for global uniqueness
  data.selections[filePath] = {
    regionName,
    timestamp: Date.now(),
  };
}
