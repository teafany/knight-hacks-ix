export type RecordPage<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export async function loadAllPages<T>(
  path: string,
  fetchPage: (path: string) => Promise<RecordPage<T>>,
): Promise<T[]> {
  const records: T[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchPage(`${path}?limit=100&offset=${offset}`);
    records.push(...page.results);
    if (!page.next) return records;
    if (page.results.length === 0)
      throw new Error(`Pagination stopped making progress for ${path}.`);
    // Use our configured API origin even when proxy-generated next links use HTTP.
    offset += page.results.length;
  }
}
