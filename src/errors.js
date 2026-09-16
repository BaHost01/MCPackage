export class McpackageError extends Error {
  constructor(message, { code = 'MCPKG_ERROR', hint, details, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'McpackageError';
    this.code = code;
    this.hint = hint;
    this.details = details;
  }
}

export function customError(error) {
  if (error instanceof McpackageError) return error;

  const message = String(error?.message || error);
  if (/ENOENT/.test(message)) {
    return new McpackageError('A required file or folder was not found.', {
      code: 'FILE_NOT_FOUND',
      hint: 'Run `mcpackage doctor` to inspect the project, or `mcpackage init` in a new folder.',
      details: message,
      cause: error,
    });
  }
  if (/EACCES|EPERM/.test(message)) {
    return new McpackageError('MCPackage does not have permission to access this path.', {
      code: 'PERMISSION_DENIED',
      hint: 'Close applications using the file and check the folder permissions.',
      details: message,
      cause: error,
    });
  }
  if (/JSON|Unexpected token|JSON.parse/.test(message)) {
    return new McpackageError('A JSON file in the project is invalid.', {
      code: 'INVALID_JSON',
      hint: 'Run `mcpackage lint` to find the exact file and repair its JSON.',
      details: message,
      cause: error,
    });
  }
  if (/not empty/i.test(message)) {
    return new McpackageError('The destination folder already contains files.', {
      code: 'DIRECTORY_NOT_EMPTY',
      hint: 'Choose another project name or use an empty directory.',
      details: message,
      cause: error,
    });
  }
  return new McpackageError(message, { details: error?.stack, cause: error });
}

export function formatError(error, { json = false } = {}) {
  const e = customError(error);
  if (json) return { error: e.message, code: e.code, ...(e.hint ? { hint: e.hint } : {}), ...(e.details ? { details: e.details } : {}) };
  return [`✖ ${e.message}`, e.hint ? `  Hint: ${e.hint}` : '', e.details && process.env.MCPACKAGE_DEBUG === '1' ? `  ${e.details}` : ''].filter(Boolean).join('\n');
}
