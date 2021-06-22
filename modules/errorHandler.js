// An improved error handler for Node
// This will provide more useful stack traces on uncaught exceptions and promise rejections
module.exports = () => {
  process.on("uncaughtException", (err) => {
    const errorMsg = err.stack.replace(new RegExp(`${__dirname}/`, "g"), "./");
    console.error(`Uncaught Exception: ${errorMsg}`);
    // Always best practice to let the code crash on uncaught exceptions. 
    // Because you should be catching them anyway.
    process.exit(1);
  });

  /*process.on("unhandledRejection", err => {
    client.logger.error(`Unhandled rejection: ${err}`);
  });*/

  process.on("unhandledRejection", (reason, p) => {
    console.error(`Unhandled rejection: \n${reason}\nStack:\n${reason.stack}\nPromise:\n${require("util").inspect(p, { depth: 2 })}`);
  });
};