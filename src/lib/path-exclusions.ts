// Helper function to check if a path should be excluded
export function isPathExcluded(path: string, excludedPaths: string[] | null): boolean {
  if (!excludedPaths || excludedPaths.length === 0) {
    return false
  }

  return excludedPaths.some(pattern => {
    // Convert wildcard pattern to regex
    // /admin/* becomes /^\/admin\/.*$/
    const regexPattern = pattern
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // Escape special chars except *
      .replace(/\*/g, '.*') // Convert * to .*

    const regex = new RegExp(`^${regexPattern}$`)
    return regex.test(path)
  })
}

// Helper function to filter out excluded paths from page stats
export function filterExcludedPaths<T extends { page: string }>(
  data: T[], 
  excludedPaths: string[] | null
): T[] {
  if (!excludedPaths || excludedPaths.length === 0) {
    return data
  }

  return data.filter(item => !isPathExcluded(item.page, excludedPaths))
}

// Helper function to generate SQL condition for excluded paths
export function generateExcludedPathsCondition(excludedPaths: string[] | null): string {
  if (!excludedPaths || excludedPaths.length === 0) {
    return ''
  }

  const conditions = excludedPaths.map(pattern => {
    // Convert wildcard pattern to SQL LIKE pattern
    // /admin/* becomes /admin/%
    const sqlPattern = pattern.replace(/\*/g, '%')
    return `page NOT LIKE '${sqlPattern}'`
  })

  return `AND ${conditions.join(' AND ')}`
}
