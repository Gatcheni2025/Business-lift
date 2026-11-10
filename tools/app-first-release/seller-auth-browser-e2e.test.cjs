'use strict';
// Local browser integration tests: synthetic Firebase Auth and Paystack service.
// NEVER use production credentials or initiate a real transaction.
const test=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../../web/app-first/public');
const health={ok:true,version:'3.25.0',approvalRequired:true,sellerApprovalBeforeCheckout:true,
  paystackCheckoutAvailable:false,billingMode:'paystack_checkout',
  introductoryFirstMonthCents:1000,subscriptionMonthlyCents:9900};
const authSource=String.raw