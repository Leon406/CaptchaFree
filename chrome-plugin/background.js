// 部署后配置默认服务器地址,也可手动设置 修改 "http://127.0.0.1:5000"为默认服务器地址
const default_server = "http://127.0.0.1:5000"

chrome.contextMenus.create({
    title: '识别验证码',
    id: 'recognize_verify_code',
    type: 'normal',
    contexts: ['image']
});

chrome.contextMenus.create({
    title: '滑块验证',
    id: 'slide_verify',
    type: 'normal',
    contexts: ['page']
});

// 兼容MV3
chrome.contextMenus.onClicked.addListener((item, tab) => {
    console.log("item", item);
    if (item.menuItemId === "recognize_verify_code") {
        if (item.srcUrl.startsWith("data:image/")) {
            console.log("background: 识别data:image/ 大小", item.srcUrl.length)
            handleBase64(item.srcUrl.replaceAll("\n", "").replaceAll("%0D%0A", ""));
        } else {
            if (new URL(item.pageUrl).host === new URL(item.srcUrl).host) {
                console.log("background: 同源url ", item.srcUrl)
                chrome.tabs.sendMessage(tab.id, {"type": "base64", data: item}, base64 => {
                    handleBase64(base64, item.srcUrl);
                    console.log(arguments, chrome.runtime.lastError);
                });
            } else {
                console.log("background: 跨域url ", item.srcUrl)
                handleBase64(undefined, item.srcUrl);
            }
        }
    } else if (item.menuItemId === "slide_verify") {
        chrome.tabs.sendMessage(tab.id, {"type": "slide_verify"}, obj => {
            console.log("background: slide_verify", obj)
            handleSlideBase64(obj.background, obj.target)
            console.log(arguments, chrome.runtime.lastError);
        });
    }

});


//background.js添加监听，并把结果反馈给浏览器页面console显示。
chrome.runtime.onMessage.addListener(request => {
    console.log(request);
    if (request.startsWith("data:image/")) {
        handleBase64(request);
    } else if (request.startsWith("http")) {
        handleBase64(undefined, request);
    }
});

function handleBase64(base64, url) {
    console.log("handleBase64", base64, url)
    chrome.storage.sync.get({"ocr_server": default_server}, config => {
        let ocrServer = config["ocr_server"] || default_server
        if (!ocrServer.includes("http")) {
            toast("错误: 服务设置错误")
            return;
        }

        !base64 && console.log("图片转base64错误,请确认图片是否有跨域限制");

        fetch(ocrServer + "/ocr", {
            "headers": {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "accept-language": "zh-CN,zh;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest"
            },
            "body": base64 ? ("base64=" + encodeURIComponent(base64.replace(/.*,/, ""))) : ("url=" + url),
            "method": "POST"
        })
            .then(response => response.json())
            .then(res => {
                console.log(res)
                if (res.status) {
                    copy(res.result, 'text/plain')
                } else {
                    toast("解析错误: " + res.msg)
                }
            })
            .catch(error => {
                toast('请求失败: ' + error.toString() + "\n请确认设置的服务是否有效!",)
            })
    })
}

// 在后台请求没有跨域问题
function handleSlideBase64(background, target) {
    console.log("handleSlideBase64", background, target)
    chrome.storage.sync.get({"ocr_server": default_server}, config => {
        let ocrServer = config["ocr_server"] || default_server
        if (!ocrServer.includes("http")) {
            toast("错误: 服务设置错误")
            return;
        }

        !background && console.log("图片转base64错误,请确认图片是否有跨域限制");

        fetch(ocrServer + "/slide", {
            "headers": {
                "accept": "application/json, text/javascript, */*; q=0.01",
                "accept-language": "zh-CN,zh;q=0.9",
                "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
                "x-requested-with": "XMLHttpRequest"
            },
            "body": "base64=" + encodeURIComponent(background.replace(/.*,/, "")) + "&target=" + encodeURIComponent(target.replace(/.*,/, "")),
            "method": "POST"
        })
            .then(response => response.json())
            .then(res => {
                console.log(res)
                if (res.status) {
                    console.log("slide", res)
                    sendMessage("slide_result", res.result)
                } else {
                    toast("解析错误: " + res.msg)
                }
            })
            .catch(error => {
                toast('请求失败: ' + error.toString() + "\n请确认设置的服务是否有效!",)
            })
    })
}

function copy(text, mimeType) {
    sendMessage("copy", {text, mimeType})
}

function toast(message) {
    sendMessage("notice", {message})
}

function sendMessage(type, message) {
    chrome.tabs.query({currentWindow: true, active: true}, tabs => {
        chrome.tabs.sendMessage(tabs[0].id, {
            "type": type, data: message
        }, () => {
            console.log(arguments, chrome.runtime.lastError);
        });
    });
}
