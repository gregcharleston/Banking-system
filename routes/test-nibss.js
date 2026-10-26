require("dotenv").config();

const { getNibssToken } = require("../services/nibssService");

async function testNibss() {
  try {
    await getNibssToken();

    console.log("NIBSS authentication successful.");
    console.log("An access token was received.");
  } catch (error) {
    console.error(
      "NIBSS authentication failed:",
      error.response?.status || error.message
    );

    if (error.response?.data) {
      console.error("Provider response:", error.response.data);
    }

    process.exitCode = 1;
  }
}

testNibss();