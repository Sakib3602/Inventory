import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../AuthContext/AuthContext";
import { loginUser } from "../../api/authApi";
import AuthLayout from "../AuthLayout/AuthLayout";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useAuth();

  const mutation = useMutation({
    mutationFn: loginUser,
    onSuccess: (data) => {
      setUser(data);
      navigate("/dashboard");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({ email, password });
  };

  return (
    <AuthLayout>
      <h1 className="text-2xl font-bold text-gray-800 mb-1">Welcome back</h1>
      <p className="text-sm text-gray-400 mb-8">আপনার account এ login করুন</p>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="Enter your mail"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-800/30 focus:border-teal-800"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="Enter your password"
                className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-teal-800/30 focus:border-teal-800 pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-xs"
              >
                {showPassword ? "🙈" : "👁"}
              </button>
            </div>
          </div>
        </div>

        {mutation.isError && (
          <p className="text-red-500 text-sm">{(mutation.error as Error).message}</p>
        )}

        <button
          type="submit"
          disabled={mutation.isPending}
          className="w-full bg-[#0f2e2e] hover:bg-[#123838] disabled:opacity-60 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg text-sm transition-colors"
        >
          {mutation.isPending ? "Logging in..." : "Log in"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-8">
        Account নেই?{" "}
        <Link to="/register" className="font-semibold text-gray-800 hover:underline">
          Register করুন
        </Link>
      </p>
    </AuthLayout>
  );
}

export default Login;