import axios from "axios";
import getCookie from "../customFunctions/GetCookie";

const baseURL = typeof window !== 'undefined' 
  ? '/api' // Use relative path for client-side
  : process.env.API_PROD_URL; // Use direct URL for server-side

const client = axios.create({
  baseURL,
  headers: {
    Accept: "application/json",
  },
});

// helper to normalize axios options (optional)
const normalizeOpts = (options = {}) => {
  if (typeof options === 'string') return { url: options, method: 'get' };
  return options;
};

const request = async (options, router) => {
  const opts = normalizeOpts(options);
  const token = getCookie("uat");
  if (token) {
    client.defaults.headers.common.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await client(opts);
    return response;
  } catch (error) {
    // log everything we can to make debugging easy
    console.error("API request error:", {
      url: opts.url || opts,
      method: opts.method,
      message: error.message,
      // axios response (if any)
      status: error?.response?.status,
      responseData: error?.response?.data,
      request: error?.request ? 'REQUEST_PRESENT' : null,
    });

    // optional: route redirect behavior (you had this)
    if (error?.response?.status === 403 && router) {
      router.push("/403");
    } else if (router && error?.response?.status) {
      // only navigate if you want to convert certain errors to pages
      router.push('/404');
    }

    // Propagate error so react-query or caller can handle it
    // Throwing whole axios error object is useful
    throw error;
  }
};

export default request;
