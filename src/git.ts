/**
 * The history of a ref, read from git: the one place a run starts a process
 * (ADR-0025).
 *
 * Only `analyse` calls it, and only when a document a check holds to its
 * commits names one: a repository that names none, or names them only in
 * documents nothing holds to them, runs no git at all. Every way the history
 * cannot be read stops the run, since a commit that could not be looked for
 * is not one that was found: no git, no repository, a shallow clone, which
 * holds only the newest commits, and a ref the repository does not have.
 */

import { execFile } from 'node:child_process';

import { historyOf, type CommitHistory } from './history.js';

/**
 * How much of a log is read: a million commits or so. Node's default, a
 * megabyte, holds some ten thousand, fewer than a repository of a few years
 * has, and a log cut there is a failed run.
 */
const LOG_BUFFER = 256 * 1024 * 1024;

/** A history that cannot be read, with what to do about it. */
export class HistoryError extends Error {
  override readonly name = 'HistoryError';
}

/**
 * What one git command prints, or why it failed. `-C` and the arguments are
 * passed as they are, with no shell, so nothing in a path or a ref is read
 * as anything but itself.
 */
function git(root: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['-C', root, ...args], { encoding: 'utf8', maxBuffer: LOG_BUFFER }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });
}

/** Reads every commit `ref` reaches, for the documents under `root`. */
export async function readHistory(root: string, ref: string): Promise<CommitHistory> {
  let shallow: string;
  try {
    shallow = (await git(root, ['rev-parse', '--is-shallow-repository'])).trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new HistoryError('git is not on PATH, and the documents name commits only git can look for: install git, or run where it is');
    }
    throw new HistoryError(`${root} is in no git repository, and the documents name commits only its history holds`);
  }
  if (shallow === 'true') {
    throw new HistoryError(
      'the repository is a shallow clone, which holds only its newest commits, so a commit the documents name may be missing from it: fetch the whole history, as actions/checkout does with fetch-depth: 0',
    );
  }
  try {
    await git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new HistoryError(`"${ref}" names no commit the repository has: give "gitRef" a branch, a tag or a commit it holds`);
  }
  return historyOf(ref, await git(root, ['log', '--format=%H%x1f%s', ref, '--']));
}
