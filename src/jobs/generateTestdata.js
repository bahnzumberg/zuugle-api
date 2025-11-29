#!/usr/bin/node
import { generateTestdata } from "./sync";
import moment from "moment";

console.log("GENERATE TEST DATA: ", moment().format("HH:mm:ss"));
generateTestdata().then(() => {
  console.log("DONE GENERATING TEST DATA: ", moment().format("HH:mm:ss"));
  process.exit();
});
