export const notFoundHandler = (req, res) => {
  res.status(404).json({ message: "Route not found." });
};

export const errorHandler = (error, req, res, next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || "Server error."
  });
};

