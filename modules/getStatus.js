// Extract the SMTP status code from a net response

module.exports = (resp) => {
  resp = resp.toString();
  let code = resp.substring(0,3);
  return code;
};