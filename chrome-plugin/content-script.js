let last_time = 0
const INTERVAL = 2000
let DEBUG = false

// 监听 background 传来的数据 可对页面dom操作
chrome.runtime.onMessage.addListener((data, sender, sendResponse) => {
    DEBUG && console.log("receive from background: ", data);

    switch (data.type) {
        case "copy":
            copy(data.data.text, data.data.mimeType)
            break;
        case "debug":
            DEBUG = data.data
            break;
        case "notice":
            toast(data.data.message)
            break;
        case "base64":
            let img = find_captcha_image(data.data.srcUrl) || getImgFromIFrame(data.data.srcUrl);
            DEBUG && console.log("gotcha img ", img)
            if (!img) {
                toast("图片解析错误")
                return
            }
            // 限制验证码图片高度, 防止滥用
            if (img.height > 200) {
                toast("你确定这是验证码?")
            } else {
                sendResponse(drawBase64Image(img));
            }
            break;
        case "rule":
            parse_config(data.data)
            break;
        case "free_edit":
            free_edit()
            break;
        case "copy_cookie":
            copy_cookie()
            break;
        case "remove_restrict":
            remove_restrict()
            break;
        default:
            console.log("error type")
    }
});


chrome.storage.sync.get({"rule": ""})
    .then(config => {
        parse_config(config.rule)
    })

function img_click(event) {
    if (debounce()) {
        toast("请勿频繁点击", 1500)
        return;
    }
    let ele = event.path[0];
    DEBUG && console.log("img click", ele)
    ele.onload = function () {
        chrome.runtime.sendMessage(drawBase64Image(ele));
        // 调试模式可以无间隔发送请求,服务器会限制请求数量
        if (!DEBUG) ele.onload = null
    }
}

function debounce(interval = INTERVAL) {
    let now = Date.now();
    interval = DEBUG ? interval / 5 : interval
    if (now - last_time < interval) {
        return true
    }
    last_time = now;
    return false
}

function copy(str, mimeType) {
    let config = fill_config[location.host];
    if (config) {
        DEBUG && console.log("自动填充", "找到规则", config.selector)
        let ele = find_element(config.selector)
        if (ele) {
            DEBUG && console.log("自动填充", "找到节点并填写", ele)
            ele.focus();
            ele.value = str
            // vue 双向绑定更新数据
            ele.dispatchEvent(new Event("input"))
        } else {
            DEBUG && console.log("自动填充", "规则失效,尝试寻找填写位置")
            auto_detect_and_fill(str)
        }
    } else {
        DEBUG && console.log("自动填充", "未找到规则, 尝试寻找填写位置")
        auto_detect_and_fill(str)
    }
    document.oncopy = function (event) {
        event.clipboardData.setData(mimeType, str);
        event.preventDefault();
    };
    document.execCommand("copy", false, str);
}

function input_condition(el) {
    return el.type !== 'hidden' && (
        find_attribute(el, "data-msg-required")
        || find_attribute(el)
        || find_attribute(el, "tip")
        || find_attribute(el, "id", "verify")
        || find_attribute(el, "id", "validate")
        || find_attribute(el, "alt", "kaptcha")
    )
}

function auto_detect_and_fill(code) {
    let verification_code_ele = Array.from(document.querySelectorAll("input")).filter(input_condition)[0];
    console.log("from iframe 11", verification_code_ele);
    if (!verification_code_ele || verification_code_ele.length === 0) {
        verification_code_ele = get_element_from_iframe(input_condition)
        console.log("from iframe 22", verification_code_ele);
    }
    if (verification_code_ele) {
        verification_code_ele.value = code
        // vue 双向绑定更新数据
        verification_code_ele.dispatchEvent(new Event("input"))
        window.setTimeout(() => {
            verification_code_ele.focus()
        }, 200);
    }
}


// 获取placeholder="验证码" ,  alt="kaptcha"
function find_attribute(element, attr = "placeholder", val = "验证码", eq = false) {
    let elementKeys = element.attributes;
    if (elementKeys == null) {
        return false;
    }
    for (let i = 0; i < elementKeys.length; i++) {
        let key = elementKeys[i].name.toLowerCase();
        if (typeof val === "string") {
            if (key === attr && (eq ? elementKeys[attr].value === val : elementKeys[attr].value.includes(val))) {
                return true;
            }
        } else {
            if (key === attr && (eq ? val.test(elementKeys[attr].value) : val.exec(elementKeys[attr].value))) {
                return true;
            }
        }
    }
    return false;
}


let exist_toast

function toast(msg, duration) {
    if (exist_toast) {
        document.body.removeChild(exist_toast)
    }

    duration = isNaN(duration) ? 2000 : duration;
    let m = document.createElement('div');
    exist_toast = m
    m.innerHTML = msg;
    m.style.cssText = "width: 40%;min-width: 150px;opacity: 0.7;height: 30px;color: rgb(255, 255, 255);line-height: 30px;text-align: center;border-radius: 5px;position: fixed;top: 5%;left: 30%;z-index: 999999;background: rgb(0, 0, 0);font-size: 12px;";
    document.body.appendChild(m);
    setTimeout(() => {
        let d = 0.5;
        m.style.webkitTransition = '-webkit-transform ' + d + 's ease-in, opacity ' + d + 's ease-in';
        m.style.opacity = '0';
        setTimeout(() => {
            Array.from(document.body.children).filter(el => el === m).forEach(
                el => {
                    document.body.removeChild(el);
                    exist_toast = null
                }
            );

        }, d * 1000);
    }, duration);
}


function getImgFromIFrame(url) {
    let root_url = new URL(url).host
    let elements = Array.from(document.querySelectorAll("iframe"))
        .filter(el => root_url === new URL(el.src).host)
        .map(el => {
            DEBUG && console.log("getImgFromIFrame frame", el, el.contentDocument.querySelectorAll("iframe"));
            return find_captcha_image(url, el.contentDocument)
        })
        .filter(el => el);
    DEBUG && console.log("getImgFromIFrame", elements, url)
    return elements && elements[0];
}

function get_element_from_iframe(cond) {
    let root_url = window.location.host
    let elements = Array.from(document.querySelectorAll("iframe"))
        .filter(el => root_url === new URL(el.src).host)
        .flatMap(el => Array.from(el.contentDocument.querySelectorAll("input")))
        .filter(el => cond(el));
    if (!elements || elements.length === 0) {
        DEBUG && console.log("get_element_from_iframe 2")
        elements = Array.from(document.querySelectorAll("iframe"))
            .filter(el => root_url === new URL(el.src).host)
            .flatMap(el =>
                Array.from(el.contentDocument.querySelectorAll("iframe"))
                    .filter(el => root_url === new URL(el.src).host)
            )
            .flatMap(el => Array.from(el.contentDocument.querySelectorAll("input")))
            .filter(el => cond(el));
    }
    DEBUG && console.log("get_element_from_iframe", elements, elements[0]);
    return elements && elements[0];
}

function find_captcha_image(url, doc = document) {
    DEBUG && console.log("find_captcha_image", url)
    if (!doc) return;
    let elements = Array.from(doc.querySelectorAll("img")).filter(el => el.src.includes(url));
    // 没有查到,查询doc中iframe
    DEBUG && console.log("find_captcha 1", elements)
    if (!elements || elements.length === 0) {
        DEBUG && console.log("find_captcha_image from iframe", doc.querySelectorAll("iframe"));
        let root_url = new URL(url).host
        elements = Array.from(doc.querySelectorAll("iframe"))
            .filter(el => root_url === new URL(el.src).host)
            .flatMap(el => {
                DEBUG && console.log("find_captcha_image from --------", doc.querySelectorAll("iframe"));
                return Array.from(el.contentDocument.querySelectorAll("img"));
            })
            .filter(el => el.src.includes(url));
        DEBUG && console.log("find_captcha iframe rr", elements);
    }
    return elements && elements[0];
}

function drawBase64Image(img) {
    DEBUG && console.log("drawBase64Image", img)
    if (img) {
        if (!Array.from(very_code_nodes).includes(img)) {
            DEBUG && console.log("cache nodes", img)
            very_code_nodes.push(img)
            listen(img)
            // img.addEventListener('click', img_click);
        }
    }
    let canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    let ctx = canvas.getContext('2d');
    ctx.filter = "grayscale()";
    ctx.drawImage(img, 0, 0, img.width, img.height);
    let dataURL;
    try {
        dataURL = canvas.toDataURL('image/webp');
    } catch (e) {
        console.info("drawBase64Image to webp", e);
        // 不支持webp时,转jpeg
        try {
            dataURL = canvas.toDataURL('image/jpeg');
        } catch (e2) {
            console.info("drawBase64Image to jpeg", e2);
        }
    }
    return dataURL;
}


//监听整个页面的 paste 事件, chrome只能监听文本
document.addEventListener('paste', e => {
    let clipboardData = window.clipboardData || e.clipboardData;
    if (!clipboardData) return;
    let type = clipboardData.items[0] && clipboardData.items[0].type;
    if (type && type.match(/image/)) {
        let blob = clipboardData.items[0].getAsFile();
        let file = new FileReader();
        file.addEventListener('loadend', e => {
            DEBUG && console.log("paste data", e.target.result)
            chrome.runtime.sendMessage(e.target.result);
        });
        file.readAsDataURL(blob);
    }
})

const image_url_reg = /https?:\/\/.*\.(png|jpg|jpeg|gif)\b.*/ig
//监听整个页面的 copy 事件,只能监听文本,图片链接
document.addEventListener('copy', e => {
    chrome.storage.sync.get({"copy_reco": false})
        .then(config => {
            if (config.copy_reco) {
                let clipboardData = window.clipboardData || e.clipboardData;
                if (!clipboardData) return;
                let text = window.getSelection().toString();
                if (text) {
                    console.info("copy text", text)
                    if (text.startsWith("data:image") || image_url_reg.test(text)) {
                        chrome.runtime.sendMessage(text);
                    }
                }
            }
        })
})

function find_element(selector) {
    let iframes = document.querySelectorAll("iframe");
    for (let iframe of iframes) {
        DEBUG && console.log("iframe", iframe);
        let ele = iframe.contentDocument.querySelector(selector);
        if (ele) {
            DEBUG && console.info("gotcha iframe", iframe);
            ele.disable = false;
            return ele;
        }
    }
    return document.querySelector(selector);
}

let fill_config = {}

// "domain,selector[,img-selector]"
function parse_config(config) {
    DEBUG && console.log("解析规则:", config)
    fill_config = {}
    let items = config.split(";")
    let host = window.location.host
    DEBUG && console.log("解析规则 items:", items)
    for (let i = 0; i < items.length; i++) {
        let info = items[i].split(",");
        DEBUG && console.log("解析规则 info:", items[i], info)
        if (host !== info[0]) continue
        if (info.length >= 2) {
            let selector = info[1]
            let img = info.length === 3 ? info[2] : ''
            fill_config[info[0]] = {selector, img}
        } else {
            DEBUG && console.log("配置错误:", items[i])
        }
    }
    DEBUG && console.log("解析结束:", fill_config)
}

function free_edit() {
    "true" === document.body.getAttribute("contenteditable") ? (
            document.body.setAttribute("contenteditable", !1), alert("网页不能编辑啦！"))
        : (document.body.setAttribute("contenteditable", !0), alert("网页可以编辑啦！"))
}

function remove_restrict() {
    let t = function (t) {
        t.stopPropagation(),
        t.stopImmediatePropagation && t.stopImmediatePropagation()
    };
    ["copy", "cut", "contextmenu", "selectstart", "mousedown", "mouseup", "keydown", "keypress", "keyup"]
        .forEach(function (e) {
            document.documentElement.addEventListener(e, t, {capture: !0})
        }), alert("解除限制成功啦！")
}

function copy_cookie() {
    let oInput = document.createElement('input');
    oInput.value = document.cookie;
    document.body.appendChild(oInput);
    oInput.select();
    document.execCommand("Copy");
    oInput.className = 'oInput';
    oInput.style.display = 'none';
    alert('复制成功');
}

const very_code_nodes = []
// Firefox和Chrome早期版本中带有前缀
const MutationObserver = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver

function listen(ele) {
    console.log("listen", ele);
    // el.addEventListener('click', img_click)
    let observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.target.onload = function () {
                if (debounce()) {
                    toast("请勿频繁点击", 1500)
                    return;
                }
                if (!mutation.target) {
                    toast("图片解析错误")
                    return
                }
                console.log("mutation", mutation.target);
                chrome.runtime.sendMessage(drawBase64Image(mutation.target));
                // 调试模式可以无间隔发送请求,服务器会限制请求数量
                if (!DEBUG) mutation.target.onload = null
            }
        });
    });

    let config = {attributes: true, attributeFilter: ["src"], childList: true, characterData: true}
    observer.observe(ele, config);
}


window.onload = function () {
    chrome.storage.sync.get({"debug": false})
        .then(config => {
            DEBUG = config.debug
            console.log("debug", DEBUG)
        })
    let verifycode_ele = Array.from(document.querySelectorAll("img")).filter(el =>
        find_attribute(el, "alt", /图片刷新|验证码/gi) ||
        find_attribute(el, "src", /Validate|captcha|login-code-img/gi) ||
        find_attribute(el, "id", /auth|code/gi) ||
        find_attribute(el, "class", /login-code|verify/gi)
    )
    if (fill_config && fill_config.img) {
        console.log("_______loaded_____ image config", fill_config, verifycode_ele)
        let ele = find_element(fill_config.img);
        if (verifycode_ele) {
            verifycode_ele.push(ele)
        } else {
            verifycode_ele = ele
        }
        console.log("_______loaded_____ image very_code_nodes", verifycode_ele)
    }
    DEBUG && console.log("_______loaded_____ find", verifycode_ele)
    chrome.storage.sync.get({"reco_on_load": false})
        .then(config => {
            verifycode_ele.forEach(el => {
                    // listen(el)
                    very_code_nodes.push(el)
                    listen(el)
                    DEBUG && console.log("_______add click_____", el)
                    if (config.reco_on_load) {
                        if (el.height > 200) {
                            toast("你确定这是验证码?")
                        } else {
                            chrome.runtime.sendMessage(drawBase64Image(el));
                        }
                    }
                }
            )
        })
}
