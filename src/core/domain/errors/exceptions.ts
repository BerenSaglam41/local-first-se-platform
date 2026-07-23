export class BaseException extends Error {
  constructor(message: string, public readonly originalError?: Error | unknown) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class StorageException extends BaseException {}
export class ConfigurationException extends BaseException {}
export class DatabaseLockedException extends StorageException {}
export class TransactionException extends StorageException {}
export class ValidationException extends BaseException {}
