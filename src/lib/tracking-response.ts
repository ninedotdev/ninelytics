import { NextResponse } from "next/server"

export function createClientClosedResponse(headers: HeadersInit) {
  return new NextResponse(null, {
    status: 499,
    headers,
  })
}
