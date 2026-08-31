import type { StudentInfoErrors } from "./types";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Basic client-side shape validation only — this identifies the
 * conversation, it is not an authentication or verification system.
 */
export function validateStudentInfo(name: string, email: string): StudentInfoErrors {
  const errors: StudentInfoErrors = {};

  if (!name.trim()) {
    errors.name = "Please enter your name.";
  }

  if (!email.trim()) {
    errors.email = "Please enter your email.";
  } else if (!EMAIL_PATTERN.test(email.trim())) {
    errors.email = "Please enter a valid email address.";
  }

  return errors;
}
