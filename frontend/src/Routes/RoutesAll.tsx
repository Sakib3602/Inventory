import { Route, Routes } from "react-router-dom";
import Register from "../components/Register/Register";
import Login from "../components/Login/Login";
import DHome from "../components/Dashboard/DHome";
import ProductMaster from "../components/Dashboard/ProductMaster";
import PublicRoute from "../components/Dashboard/PublicRoute";
import PrivateRoute from "../components/Dashboard/PrivateRoute";

const RoutesAll = () => {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            <Register />
          </PublicRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <PrivateRoute>
            <DHome />
          </PrivateRoute>
        }
      >
        <Route path="product" element={<ProductMaster />} />
       
      </Route>
    </Routes>
  );
};

export default RoutesAll;