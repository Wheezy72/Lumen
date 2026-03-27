import React from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ user, message, children }) {
  if (user) return children;

  return (
    <Navigate
      to="/login"
      replace
      state={message ? { message } : undefined}
    />
  );
}
