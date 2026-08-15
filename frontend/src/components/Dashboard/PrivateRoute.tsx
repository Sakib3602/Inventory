import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../AuthContext/AuthContext";

interface PrivateRouteProps {
  children: ReactNode;
}

const PrivateRoute = ({ children }: PrivateRouteProps) => {
  const { isAuthenticated, isLoading } = useAuth();


  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">লোড হচ্ছে...</p>
      </div>
    );
  }

  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }


  return <>{children}</>;
};

export default PrivateRoute;