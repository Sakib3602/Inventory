const BASE_URL = "http://localhost:5000";

export interface User {
  _id: string;
  email: string;
}

export interface AuthPayload {
  email: string;
  password: string;
}

// credentials: "include" থাকা MUST — নাহলে browser cookie পাঠাবে/রাখবে না
export async function registerUser(payload: AuthPayload): Promise<User> {
  const res = await fetch(`${BASE_URL}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Registration failed");
  return data;
}

export async function loginUser(payload: AuthPayload): Promise<User> {
  const res = await fetch(`${BASE_URL}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Login failed");
  return data;
}

export async function logoutUser(): Promise<{ message: string }> {
  const res = await fetch(`${BASE_URL}/logout`, {
    method: "POST",
    credentials: "include",
  });
  return res.json();
}

export async function getMe(): Promise<User> {
  const res = await fetch(`${BASE_URL}/me`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}