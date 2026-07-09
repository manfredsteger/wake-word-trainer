import path from 'path';

export const PROJECT_ROOT = path.resolve(process.cwd(), '..');
export const OUTPUT_DIR = path.join(PROJECT_ROOT, 'output');
export const DATA_DIR = path.join(PROJECT_ROOT, 'data');
export const LOGS_DIR = path.join(DATA_DIR, 'logs');
export const PYTHON = path.join(PROJECT_ROOT, '.venv', 'bin', 'python');
export const TRAIN_SCRIPT = path.join(PROJECT_ROOT, 'train.py');
