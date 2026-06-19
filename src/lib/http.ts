export function badRequest(message: string, details?: unknown) {
  return Response.json({ error: message, details }, { status: 400 });
}

export function unauthorized(message = "Authentication required") {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = "Forbidden") {
  return Response.json({ error: message }, { status: 403 });
}

export function notFound(message = "Not found") {
  return Response.json({ error: message }, { status: 404 });
}

export function conflict(message: string) {
  return Response.json({ error: message }, { status: 409 });
}

export function serverError() {
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
