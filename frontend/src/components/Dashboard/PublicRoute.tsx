import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext/AuthContext";

interface PublicRouteProps {
  children: ReactNode;
}

// Login/Register page এর জন্য — আগে থেকে login থাকলে dashboard এ পাঠায়
const PublicRoute = ({ children }: PublicRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">লোড হচ্ছে...</p>
      </div>
    );
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default PublicRoute;