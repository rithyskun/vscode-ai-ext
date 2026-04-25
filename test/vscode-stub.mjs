export const FileType = {
  File: 1,
  Directory: 2,
};

export class Uri {
  constructor(fsPath = '') {
    this.fsPath = fsPath;
    this.path = fsPath;
  }

  static file(filePath) {
    return new Uri(filePath);
  }

  static joinPath(base, ...paths) {
    return new Uri([base?.fsPath ?? '', ...paths].join('/'));
  }
}

export const workspace = {
  workspaceFolders: [{ uri: Uri.file(process.cwd()) }],
  fs: {
    async readFile() {
      return new Uint8Array();
    },
    async writeFile() {},
    async createDirectory() {},
    async readDirectory() {
      return [];
    },
    async delete() {},
    async stat() {
      return { type: FileType.File };
    },
  },
  async openTextDocument() {
    return { uri: Uri.file('/tmp/mock') };
  },
};

export const window = {
  async showWarningMessage(_message, _options, ...items) {
    return items[0];
  },
  createTerminal() {
    return {
      show() {},
      sendText() {},
    };
  },
};

export const commands = {
  async executeCommand() {},
};
