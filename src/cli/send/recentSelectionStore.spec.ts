import { RecentSelectionsData } from './recentSelectionStore';

// Mock fs module - must be before the dynamic import
const mockReadFile = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: mockReadFile,
    writeFile: mockWriteFile,
    mkdir: mockMkdir,
  },
}));

// Dynamic import types
type RecentSelectionStoreModule = typeof import('./recentSelectionStore');

describe('recentSelectionStore', () => {
  let loadRecentSelections: RecentSelectionStoreModule['loadRecentSelections'];
  let saveRecentSelections: RecentSelectionStoreModule['saveRecentSelections'];
  let getRecentSelection: RecentSelectionStoreModule['getRecentSelection'];
  let setRecentSelection: RecentSelectionStoreModule['setRecentSelection'];

  beforeEach(async () => {
    jest.resetModules();
    jest.clearAllMocks();
    mockReadFile.mockRejectedValue(new Error('ENOENT'));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);

    // Dynamically import the module after mocks are set up
    const module = await import('./recentSelectionStore');
    loadRecentSelections = module.loadRecentSelections;
    saveRecentSelections = module.saveRecentSelections;
    getRecentSelection = module.getRecentSelection;
    setRecentSelection = module.setRecentSelection;
  });

  describe('loadRecentSelections', () => {
    it('should return empty data when file does not exist', async () => {
      const data = await loadRecentSelections();
      expect(data).toEqual({ version: 1, selections: {} });
    });

    it('should load existing selections from file', async () => {
      const testData: RecentSelectionsData = {
        version: 1,
        selections: {
          '/path/to/test.http': { regionName: 'getUsers', timestamp: 1000 },
        },
      };
      mockReadFile.mockResolvedValue(JSON.stringify(testData));

      const data = await loadRecentSelections();
      expect(data).toEqual(testData);
    });

    it('should return empty data when file is invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json');

      const data = await loadRecentSelections();
      expect(data).toEqual({ version: 1, selections: {} });
    });

    it('should return empty data when version is wrong', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ version: 999, selections: {} }));

      const data = await loadRecentSelections();
      expect(data).toEqual({ version: 1, selections: {} });
    });
  });

  describe('saveRecentSelections', () => {
    it('should save selections to file', async () => {
      const testData: RecentSelectionsData = {
        version: 1,
        selections: {
          '/path/to/test.http': { regionName: 'getUsers', timestamp: 1000 },
        },
      };

      await saveRecentSelections(testData);

      expect(mockMkdir).toHaveBeenCalled();
      expect(mockWriteFile).toHaveBeenCalled();
      const writtenContent = mockWriteFile.mock.calls[0][1];
      expect(JSON.parse(writtenContent)).toEqual(testData);
    });

    it('should create ~/.httpyac directory', async () => {
      await saveRecentSelections({ version: 1, selections: {} });

      expect(mockMkdir).toHaveBeenCalledWith(expect.stringContaining('.httpyac'), { recursive: true });
    });

    it('should not throw when write fails', async () => {
      mockWriteFile.mockRejectedValue(new Error('EPERM'));

      // Should not throw
      await expect(saveRecentSelections({ version: 1, selections: {} })).resolves.not.toThrow();
    });
  });

  describe('getRecentSelection', () => {
    it('should return undefined when no selection exists', () => {
      const data: RecentSelectionsData = { version: 1, selections: {} };
      const result = getRecentSelection(data, '/path/to/test.http');
      expect(result).toBeUndefined();
    });

    it('should return region name for matching file path', () => {
      const data: RecentSelectionsData = {
        version: 1,
        selections: {
          '/path/to/test.http': { regionName: 'getUsers', timestamp: 1000 },
        },
      };
      const result = getRecentSelection(data, '/path/to/test.http');
      expect(result).toBe('getUsers');
    });

    it('should use absolute path as key', () => {
      const data: RecentSelectionsData = {
        version: 1,
        selections: {
          '/Users/john/project/api/test.http': { regionName: 'createUser', timestamp: 1000 },
        },
      };
      const result = getRecentSelection(data, '/Users/john/project/api/test.http');
      expect(result).toBe('createUser');
    });
  });

  describe('setRecentSelection', () => {
    it('should add new selection', () => {
      const data: RecentSelectionsData = { version: 1, selections: {} };
      setRecentSelection(data, '/path/to/test.http', 'getUsers');

      expect(data.selections['/path/to/test.http']).toBeDefined();
      expect(data.selections['/path/to/test.http'].regionName).toBe('getUsers');
      expect(data.selections['/path/to/test.http'].timestamp).toBeGreaterThan(0);
    });

    it('should update existing selection', () => {
      const data: RecentSelectionsData = {
        version: 1,
        selections: {
          '/path/to/test.http': { regionName: 'getUsers', timestamp: 1000 },
        },
      };
      setRecentSelection(data, '/path/to/test.http', 'createUser');

      expect(data.selections['/path/to/test.http'].regionName).toBe('createUser');
      expect(data.selections['/path/to/test.http'].timestamp).toBeGreaterThan(1000);
    });

    it('should handle "all" selection', () => {
      const data: RecentSelectionsData = { version: 1, selections: {} };
      setRecentSelection(data, '/path/to/test.http', 'all');

      expect(data.selections['/path/to/test.http'].regionName).toBe('all');
    });
  });
});
