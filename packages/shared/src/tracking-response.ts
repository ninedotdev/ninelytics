export function createClientClosedResponse(headers: HeadersInit) {
  return new Response(null, {
    status: 499,
    headers,
  })
}
