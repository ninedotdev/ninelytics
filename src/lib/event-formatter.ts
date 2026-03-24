// Format event names and messages for better readability

export function formatEventName(eventName: string): string {
  const eventMap: Record<string, string> = {
    'page_performance': 'Page Performance',
    'time_on_page': 'Time on Page',
    'scroll_depth': 'Scroll Depth',
    'rage_click': 'Rage Click',
    'exit_intent': 'Exit Intent',
    'button_click': 'Button Click',
    'form_submit': 'Form Submit',
    'video_play': 'Video Play',
    'file_download': 'File Download',
    'user_identified': 'User Identified',
  }

  return eventMap[eventName] || eventName
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function formatEventMessage(
  eventType: string,
  eventName: string,
  properties?: Record<string, unknown>
): string {
  const formattedName = formatEventName(eventName)

  switch (eventType) {
    case 'engagement':
      if (eventName === 'scroll_depth') {
        const depth = properties?.depth || 0
        return `Scrolled to ${depth}% of the page`
      }
      if (eventName === 'time_on_page') {
        const duration = properties?.duration || 0
        return `Spent ${Math.round(Number(duration))}s on page`
      }
      if (eventName === 'rage_click') {
        return 'Detected rapid clicking'
      }
      if (eventName === 'exit_intent') {
        return 'User attempted to leave the page'
      }
      return `${formattedName} event triggered`

    case 'performance':
      if (eventName === 'page_performance') {
        const loadTime = properties?.loadTime || 0
        return `Page loaded in ${(Number(loadTime) / 1000).toFixed(2)}s`
      }
      return `Performance: ${formattedName}`

    case 'click':
      const element = properties?.element || 'element'
      return `Clicked on ${element}`

    case 'custom':
      return `${formattedName}`

    case 'identify':
      return 'User identified'

    default:
      return `${formattedName} triggered`
  }
}

