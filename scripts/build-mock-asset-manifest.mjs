import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const manifestFile="src/lib/mock-exams/question-assets.json";

/** 配信する問題画像だけを走査する。symlinkや外部URLを出題資産にしない。 */
export function buildMockAssetManifest(root=process.cwd()) {
  const publicRoot=path.join(root,"public"),assets={};
  const walk=directory=>{
    for(const entry of fs.readdirSync(directory,{withFileTypes:true}).sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)){
      const full=path.join(directory,entry.name);
      if(entry.isSymbolicLink())throw new Error("Mock question image symlinks are not supported");
      if(entry.isDirectory())walk(full);
      else if(entry.isFile()&&/\.(png|jpe?g|webp|gif|avif|svg)$/i.test(entry.name)){
        const key="/"+path.relative(publicRoot,full).split(path.sep).join("/");
        assets[key]=createHash("sha256").update(fs.readFileSync(full)).digest("hex");
      }
    }
  };
  walk(path.join(publicRoot,"kakomon"));
  return {version:1,assets};
}

export function assertMockAssetManifest(root=process.cwd(),manifest=JSON.parse(fs.readFileSync(path.join(root,manifestFile),"utf8"))) {
  if(JSON.stringify(buildMockAssetManifest(root))!==JSON.stringify(manifest)){
    throw new Error("Mock question image manifest differs. Restore removed/modified images; review additions before running --write.");
  }
}

/** 画像の追加は許可するが、過去に記録したパス・内容の消失を再生成で隠さない。 */
export function writeMockAssetManifest(root=process.cwd()) {
  const destination=path.join(root,manifestFile),current=buildMockAssetManifest(root);
  if(fs.existsSync(destination)){
    const previous=JSON.parse(fs.readFileSync(destination,"utf8"));
    if(previous.version!==1||!previous.assets)throw new Error("Invalid previous mock asset manifest");
    for(const [key,hash] of Object.entries(previous.assets)){
      if(current.assets[key]!==hash)throw new Error("Recorded mock question image was removed or overwritten; restore it before regeneration.");
    }
  }
  const text=(JSON.stringify(current,null,2)+"\n").replace(/\n/g,"\r\n");
  fs.mkdirSync(path.dirname(destination),{recursive:true});
  fs.writeFileSync(destination,text,"utf8");
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]==="--write"){
    writeMockAssetManifest();
    console.log("Mock question image manifest generated. Existing adopted image paths/content must never be replaced.");
  }else if(process.argv.length===2||process.argv[2]==="--check"){
    assertMockAssetManifest();console.log("Mock question image manifest verified.");
  }else{throw new Error("Use --check or --write");}
}
