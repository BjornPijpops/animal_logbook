export function verificationEmail(url: string) {
  return {
    subject: "Verify your email for Animal Logbook",
    text: `Welcome to Animal Logbook!\n\nConfirm your email address to finish creating your account:\n${url}\n\nIf you did not sign up, you can ignore this message.`,
  };
}

export function resetPasswordEmail(url: string) {
  return {
    subject: "Reset your Animal Logbook password",
    text: `Use this link to choose a new password:\n${url}\n\nIt expires in one hour. If you did not request this, you can ignore this message.`,
  };
}
