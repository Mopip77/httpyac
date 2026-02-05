import * as models from '../../models';
import * as io from '../../io';
import * as utils from '../../utils';
import { SendOptions } from './options';
import {
  loadRecentSelections,
  saveRecentSelections,
  getRecentSelection,
  setRecentSelection,
} from './recentSelectionStore';

type SelectActionResult = Array<{ httpRegions?: Array<models.HttpRegion>; httpFile: models.HttpFile }>;

export async function selectHttpFiles(
  httpFiles: Array<models.HttpFile>,
  cliOptions: SendOptions
): Promise<SelectActionResult> {
  if (cliOptions.all) {
    return httpFiles.map(httpFile => ({
      httpFile,
    }));
  }
  const resultWithArgs = selectHttpFilesWithArgs(httpFiles, cliOptions);
  if (resultWithArgs.length > 0) {
    return resultWithArgs;
  }
  return await selectManualHttpFiles(httpFiles);
}

function selectHttpFilesWithArgs(httpFiles: Array<models.HttpFile>, cliOptions: SendOptions) {
  const result: SelectActionResult = [];

  for (const httpFile of httpFiles) {
    const httpRegions = httpFile.httpRegions.filter(h => {
      if (hasName(h, cliOptions.name)) {
        return true;
      }
      if (hasTag(h, cliOptions.tag)) {
        return true;
      }
      if (isLine(h, cliOptions.line)) {
        return true;
      }
      return false;
    });
    if (httpRegions.length > 0) {
      result.push({
        httpFile,
        httpRegions,
      });
    }
  }
  return result;
}

function hasName(httpRegion: models.HttpRegion, name: string | undefined) {
  if (name) {
    return httpRegion.metaData?.name === name;
  }
  return false;
}

function isLine(httpRegion: models.HttpRegion, line: number | undefined) {
  if (line !== undefined) {
    return line && httpRegion.symbol.startLine <= line && httpRegion.symbol.endLine >= line;
  }
  return false;
}

function hasTag(httpRegion: models.HttpRegion, tags: Array<string> | undefined) {
  if (tags && utils.isString(httpRegion.metaData?.tag)) {
    const metaDataTag = httpRegion.metaData.tag?.split(',').map(t => t.trim());
    return tags.some(t => metaDataTag.includes(t));
  }
  return false;
}

async function selectManualHttpFiles(httpFiles: Array<models.HttpFile>): Promise<SelectActionResult> {
  // Count total non-global regions across all files
  const allNonGlobalRegions: Array<{ httpRegion: models.HttpRegion; httpFile: models.HttpFile }> = [];
  for (const httpFile of httpFiles) {
    for (const httpRegion of httpFile.httpRegions) {
      if (!httpRegion.isGlobal()) {
        allNonGlobalRegions.push({ httpRegion, httpFile });
      }
    }
  }

  // If there's only one non-global region, execute it directly without user selection
  if (allNonGlobalRegions.length === 1) {
    const { httpRegion, httpFile } = allNonGlobalRegions[0];
    return [{ httpRegions: [httpRegion], httpFile }];
  }

  const httpRegionMap: Record<string, SelectActionResult> = {};
  const orderedChoices: string[] = [];
  const hasManyFiles = httpFiles.length > 1;
  const cwd = `${process.cwd()}`;

  // Track region names to save mapping (key -> filePath and regionName for saving)
  const choiceToRegionName: Record<string, { filePath: string; regionName: string }> = {};

  // Load recent selections once (now stored globally in ~/.httpyac/recent.json)
  const recentData = await loadRecentSelections();

  for (const httpFile of httpFiles) {
    const fileName = utils.ensureString(httpFile.fileName)?.replace(cwd, '.');
    const filePath = io.fileProvider.fsPath(httpFile.fileName) || '';

    // 1. Get recent selection for this file
    const recentRegionName = getRecentSelection(recentData, filePath);

    // 2. Collect all available region names
    const availableRegions = httpFile.httpRegions.filter(r => !r.isGlobal()).map(r => r.symbol.name);

    // 3. Validate if recent is still valid
    const isRecentValid =
      recentRegionName && (recentRegionName === 'all' || availableRegions.includes(recentRegionName));

    // 4. Build choices in order

    // 4a. Recent first (if valid)
    if (isRecentValid) {
      const recentLabel = hasManyFiles ? `${fileName}: recent(${recentRegionName})` : `recent(${recentRegionName})`;
      orderedChoices.push(recentLabel);
      if (recentRegionName === 'all') {
        httpRegionMap[recentLabel] = [{ httpFile }];
      } else {
        const region = httpFile.httpRegions.find(r => r.symbol.name === recentRegionName);
        if (region) {
          httpRegionMap[recentLabel] = [{ httpRegions: [region], httpFile }];
        }
      }
      choiceToRegionName[recentLabel] = { filePath, regionName: recentRegionName };
    }

    // 4b. "all" option
    const allLabel = hasManyFiles ? `${fileName}: all` : 'all';
    orderedChoices.push(allLabel);
    httpRegionMap[allLabel] = [{ httpFile }];
    choiceToRegionName[allLabel] = { filePath, regionName: 'all' };

    // 4c. Individual regions
    for (const httpRegion of httpFile.httpRegions) {
      if (!httpRegion.isGlobal()) {
        const name = httpRegion.symbol.name;
        const label = hasManyFiles ? `${fileName}: ${name}` : name;
        orderedChoices.push(label);
        httpRegionMap[label] = [{ httpRegions: [httpRegion], httpFile }];
        choiceToRegionName[label] = { filePath, regionName: name };
      }
    }
  }

  // 5. Show prompt
  const inquirer = await import('inquirer');
  const answer = await inquirer.default.prompt([
    {
      type: 'list',
      name: 'region',
      message: 'please choose which region to use',
      choices: orderedChoices,
    },
  ]);

  if (answer.region && httpRegionMap[answer.region]) {
    const result = httpRegionMap[answer.region];

    // 6. Save selection
    const saveInfo = choiceToRegionName[answer.region];
    if (saveInfo) {
      setRecentSelection(recentData, saveInfo.filePath, saveInfo.regionName);
      await saveRecentSelections(recentData);
    }

    return result;
  }
  return [];
}
