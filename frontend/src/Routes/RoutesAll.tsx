import { Route, Routes } from "react-router-dom";
import Register from "../components/Register/Register";
import Login from "../components/Login/Login";
import DHome from "../components/Dashboard/DHome";
import ProductMaster from "../components/Dashboard/ProductMaster";
import PublicRoute from "../components/Dashboard/PublicRoute";
import PrivateRoute from "../components/Dashboard/PrivateRoute";
import FactoryOrderPage from "../components/Dashboard/FactoryOrderPage";
import FactoryReturnPage from "../components/Dashboard/FactoryReturnPage";
import FundPage from "../components/Dashboard/FundPage";
import CompanyLedgerPage from "../components/Dashboard/Companyledgerpage";
import CustomerPage from "../components/Dashboard/Customerpage";
import SalePage from "../components/Dashboard/Salepage";
import StockPage from "../components/Dashboard/Stockpage";
import Dashboard from "../components/Dashboard/Dashboard";

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
        <Route index element={<Dashboard />} />
        <Route path="factory-order" element={<FactoryOrderPage />} />
        <Route path="factory-return" element={<FactoryReturnPage />} />
        <Route path="product" element={<ProductMaster />} />
        <Route path="company-ledger" element={<CompanyLedgerPage />} />
        <Route path="fund" element={<FundPage />} />
        <Route path="customers" element={<CustomerPage />} />

        <Route path="sale" element={<SalePage />} />
        <Route path="stock" element={<StockPage />} />
      </Route>
    </Routes>
  );
};

export default RoutesAll;
