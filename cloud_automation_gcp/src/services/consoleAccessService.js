const DEFAULT_CONSOLE_URL = 'https://console.cloud.google.com/';

export async function generateAndLogConsoleUrl(request, user) {
  const projectId = request.gcpProjectId || user.gcpProjectId;
  const consoleUrl = projectId
    ? `https://console.cloud.google.com/home/dashboard?project=${encodeURIComponent(projectId)}`
    : DEFAULT_CONSOLE_URL;

  if (user?.userIndex != null && request?._id) {
    const Request = (await import('../models/Request.js')).default;
    await Request.findOneAndUpdate(
      { _id: request._id, 'identityUsers.userIndex': user.userIndex },
      { $set: { 'identityUsers.$.consoleUrl': consoleUrl } }
    );
  }

  return consoleUrl;
}
