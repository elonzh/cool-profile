export function repositorySubjectIssue(subject: string, source: string): string | undefined {
  const segments = subject.split('/');
  if (
    subject.length > 300 ||
    segments.length < 2 ||
    (source === 'github' && segments.length !== 2) ||
    segments.some((part) => !/^[\p{L}\p{N}_.-]+$/u.test(part) || part === '.' || part === '..')
  ) {
    return source === 'github' ? 'Expected owner/repository' : 'Expected group/path/repository';
  }
  return undefined;
}
