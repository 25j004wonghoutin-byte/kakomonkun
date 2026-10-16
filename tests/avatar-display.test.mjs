import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { registerHooks } from "node:module";
registerHooks({resolve(specifier,context,next){return next(["next/link","next/navigation"].includes(specifier)?`${specifier}.js`:specifier,context);}});
let component={};
try { component=await import("../src/components/student-avatar.tsx"); } catch(e){if(e.code!=="ERR_MODULE_NOT_FOUND")throw e;}
const avatarUrl="/api/avatars/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222";
test("a legacy external avatar never renders as an image request",()=>{
  assert.equal(typeof component.StudentAvatar,"function");
  const html=renderToStaticMarkup(React.createElement(component.StudentAvatar,{avatarUrl:"https://legacy.example/a.png",displayName:"学生",size:72}));
  assert.doesNotMatch(html,/<img|legacy\.example/);assert.match(html,/学/);
});
test("a managed avatar uses the authenticated same-origin source without an optimizer",()=>{
  assert.equal(typeof component.StudentAvatar,"function");
  const html=renderToStaticMarkup(React.createElement(component.StudentAvatar,{avatarUrl,displayName:"学生",size:72}));
  assert.ok(html.includes(`src="${avatarUrl}"`));assert.doesNotMatch(html,/_next\/image|supabase\.co/);
});
test("an explicitly supplied avatar renders even when the shell already knows the student name",async()=>{
  const {StudentShell}=await import("../src/components/student-shell.tsx");
  const {PathnameContext}=await import("next/dist/shared/lib/hooks-client-context.shared-runtime.js");
  const html=renderToStaticMarkup(React.createElement(PathnameContext.Provider,{value:"/profile"},React.createElement(StudentShell,{userName:"検証学生",avatarUrl},"content")));
  assert.ok(html.includes(`src="${avatarUrl}"`));assert.match(html,/検証学生/);
});
