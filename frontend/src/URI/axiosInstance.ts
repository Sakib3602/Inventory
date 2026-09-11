import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "https://inventory-sgxu.onrender.com",
  withCredentials: true, // httpOnly cookie পাঠানোর জন্য must
});

export default axiosInstance;