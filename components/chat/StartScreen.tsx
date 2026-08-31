"use client";

import { useId, useState, type FormEvent } from "react";
import { validateStudentInfo } from "../../lib/chat/validation";
import type { StudentInfo, StudentInfoErrors } from "../../lib/chat/types";

interface StartScreenProps {
  onStart: (student: StudentInfo) => void;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errors, setErrors] = useState<StudentInfoErrors>({});
  const nameId = useId();
  const emailId = useId();
  const nameErrorId = useId();
  const emailErrorId = useId();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationErrors = validateStudentInfo(name, email);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length === 0) {
      onStart({ name: name.trim(), email: email.trim() });
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-xl font-semibold text-neutral-900 sm:text-2xl">
          AI Welfare Assistant
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          Get guidance on academic, financial, housing, wellbeing and other
          student support topics. I can help you find information and
          connect you with the right support at the university.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <label
              htmlFor={nameId}
              className="block text-sm font-medium text-neutral-800"
            >
              Name
            </label>
            <input
              id={nameId}
              type="text"
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-required="true"
              aria-invalid={errors.name ? "true" : "false"}
              aria-describedby={errors.name ? nameErrorId : undefined}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
            />
            {errors.name && (
              <p id={nameErrorId} className="mt-1 text-sm text-red-600">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={emailId}
              className="block text-sm font-medium text-neutral-800"
            >
              Email
            </label>
            <input
              id={emailId}
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              aria-required="true"
              aria-invalid={errors.email ? "true" : "false"}
              aria-describedby={errors.email ? emailErrorId : undefined}
              className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:border-indigo-500"
            />
            {errors.email && (
              <p id={emailErrorId} className="mt-1 text-sm text-red-600">
                {errors.email}
              </p>
            )}
          </div>

          <button
            type="submit"
            className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
          >
            Start conversation
          </button>
        </form>

        <p className="mt-4 text-xs text-neutral-500">
          Your name and email are used to identify this conversation, not to
          create an account.
        </p>
      </div>
    </main>
  );
}
