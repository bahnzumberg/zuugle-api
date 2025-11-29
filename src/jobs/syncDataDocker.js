#!/usr/bin/node
import { writeKPIs, truncateAll, restoreDump } from "./sync.js";

console.log("Truncate tables");
truncateAll().then(() => {
  console.log("Restore from database dump (this will take a while)");
  restoreDump().then(() => {
    console.log("Write KPIs");
    writeKPIs().then(() => {
      console.log("Database ready!");
      process.exit();
    });
  });
});
