export function getMethodColor(method: string): string {
  const colors: Record<string, string> = {
    GET: "bg-green-500",
    POST: "bg-blue-500",
    PUT: "bg-yellow-500",
    DELETE: "bg-red-500",
    PATCH: "bg-purple-500",
  };
  return colors[method] || "bg-gray-500";
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-green-500",
    completed: "bg-blue-500",
    paused: "bg-yellow-500",
    archived: "bg-gray-500",
  };
  return colors[status] || "bg-gray-500";
}
