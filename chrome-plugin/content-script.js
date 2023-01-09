let last_time = 0
const INTERVAL = 2000
let DEBUG = false
let MODE
// 避免多次查询,提升性能
let found_captcha_img
let found_captcha_input
let found_target
let exist_toast

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
            found_captcha_img = found_captcha_img || get_one_element(el => el.src.includes(data.data.srcUr), "img");
            DEBUG && console.log("gotcha img ", found_captcha_img)
            if (!found_captcha_img) {
                toast("未找到验证码图片!!!")
                return
            }
            // 限制验证码图片高度, 防止滥用, 排除宽小于等于高
            if (found_captcha_img.height > 200 || found_captcha_img.height >= found_captcha_img.width) {
                toast("你确定这是验证码?")
            } else {
                sendResponse(drawBase64Image(found_captcha_img));
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
        case "mode":
            MODE = data.data
            break;
        case "slide_verify":
            if (!found_target && fill_config.target) {
                found_target = find_element(fill_config.target);
                console.log("_______slide_verify_____ found_target", found_target)
            }
            if (found_target && found_captcha_img) {
                let target = found_target.toDataURL()
                let background = found_captcha_img.toDataURL()
                sendResponse({target, background})
            } else {
                toast("请确认是否配置滑块规则?")
            }

            break;
        case "slide_result":
            console.log("slide_result", data.data.target[0], found_captcha_input);
            // let t = document.querySelector("#captcha>canvas.block")
            // let slider = document.querySelector(".slider")
            moveSideCaptcha(found_target, found_captcha_input, data.data.target[0])
            break;
        default:
            console.log("error type")
    }
});

chrome.storage.sync.get({"rule": ""})
    .then(config => {
        parse_config(config.rule)
    })

function debounce(interval = INTERVAL) {
    let now = Date.now();
    interval = DEBUG ? interval / 5 : interval
    if (now - last_time < interval) {
        return true
    }
    last_time = now;
    return false
}

function get_captcha_input(text) {
    if (fill_config.selector) {
        DEBUG && console.info("==fill==", "找到规则@@@", fill_config.selector)
        let ele = find_element(fill_config.selector)
        if (ele) {
            DEBUG && console.info("==fill==", "找到节点并填写!!!", ele)
            fill_input(ele, text);
        } else {
            DEBUG && console.warn("==fill==", "规则失效,尝试寻找填写位置")
            auto_detect_and_fill_captcha(text)
        }
    } else {
        DEBUG && console.warn("==fill==", "未找到规则, 尝试寻找填写位置")
        auto_detect_and_fill_captcha(text)
    }
}

function copy(text, mimeType) {
    text = post_process_captcha(text)
    if (found_captcha_input) {
        console.log("=======>", "got input");
        fill_input(found_captcha_input, text)
    } else {
        get_captcha_input(text);
    }
    toast(`验证码: ${text} ,如未复制到粘贴板请手动填写`)

    document.oncopy = function (event) {
        event.clipboardData.setData(mimeType, text);
        event.preventDefault();
    };
    document.execCommand("copy", false, text);
}

function fill_input(input, text) {
    DEBUG && console.log("==fill_input", text, input);
    input.focus();
    input.value = text
    input.dispatchEvent(new Event("input")) // vue 双向绑定更新数据
}

function input_condition(el) {
    return el.type !== 'hidden' && (find_attribute(el) || find_attribute(el, "id", /validate|veryCode|verify/gi) || find_attribute(el, "alt", "kaptcha") || find_attribute(el, "data-msg-required") || find_attribute(el, "tip"))
}

function image_condition(el) {
    return find_attribute(el, "alt", /图片刷新|看不清|换一张|验证码/gi) || find_attribute(el, "src", /Validate|captcha|check_code|login-code-img/gi) || find_attribute(el, "id", /auth|yanzhengma|yzm|verify|captcha|imgcode/gi) || find_attribute(el, "class", /login-code|yanzhengma|yzm|code-img|captcha|verify/gi) || find_attribute(el, "title", /图片刷新|看不清|换一张|验证码/gi)
}

function auto_detect_and_fill_captcha(captcha) {
    if (found_captcha_input) {
        DEBUG && console.log("==auto_detect", "got input!!!");
        fill_input(found_captcha_input, captcha)
        return
    }

    found_captcha_input = get_one_element(input_condition)
    DEBUG && console.log("==auto_detect", found_captcha_input);
    if (found_captcha_input) fill_input(found_captcha_input, captcha);
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
            Array.from(document.body.children).filter(el => el === m).forEach(el => {
                document.body.removeChild(el);
                exist_toast = null
            });

        }, d * 1000);
    }, duration);
}

function get_one_element(cond = el => el, selector = "input") {
    let elements = get_elements(cond, selector)
    return elements && elements[0];
}

function get_elements(cond = el => el, selector = "input") {
    let elements = Array.from(document.querySelectorAll(selector)).filter(el => cond(el));
    if (elements.length === 0) {
        elements = find_all_iframe()
            .flatMap(el => Array.from(el.contentDocument.querySelectorAll(selector)))
            .filter(el => cond(el));
    }

    DEBUG && console.log("get_one_element", elements, elements[0]);
    return elements;
}

function get_host(url) {
    return new URL(url).host
}

function find_all_iframe(doc = document) {
    let root_url = window.location.host
    let frames = Array.from(doc.querySelectorAll("iframe"))
        .filter(el => root_url === get_host(el.baseURI))
    if (frames.length > 0) {
        let frames2 = frames.flatMap(el => find_all_iframe(el.contentDocument))
        if (frames2.length > 0) {
            frames2.forEach(e => frames.push(e))
        }
    }
    return frames;
}

function drawBase64Image(img) {
    DEBUG && console.log("drawBase64Image", img)
    if (img) {
        if (!Array.from(very_code_nodes).includes(img)) {
            DEBUG && console.log("cache nodes", img)
            very_code_nodes.push(img)
            listen(img)
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
    if (!selector) return;
    return get_one_element(el => el, selector);
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
            let img = info.length >= 3 ? info[2] : ''
            let target = info.length >= 4 ? info[3] : ''
            fill_config = {selector, img, target}
        } else {
            DEBUG && console.log("配置错误:", items[i])
        }
    }
    DEBUG && console.log("解析结束:", fill_config)
}

function free_edit() {
    "true" === document.body.getAttribute("contenteditable") ? (document.body.setAttribute("contenteditable", !1), alert("网页不能编辑啦！")) : (document.body.setAttribute("contenteditable", !0), alert("网页可以编辑啦！"))
}

function remove_restrict() {
    let t = function (t) {
        t.stopPropagation(), t.stopImmediatePropagation && t.stopImmediatePropagation()
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
    let observer = new MutationObserver(function (mutations) {
        mutations.forEach(function (mutation) {
            mutation.target.onload = function () {
                if (found_target) {
                    console.log("滑块");
                    return;
                }
                if (debounce()) {
                    toast("请勿频繁点击", 1500)
                    return;
                }
                if (!mutation.target) {
                    toast("图片解析错误")
                    return
                }
                DEBUG && console.log("mutation", mutation.target);
                chrome.runtime.sendMessage(drawBase64Image(mutation.target));
                // 调试模式可以无间隔发送请求,服务器会限制请求数量
                if (!DEBUG) mutation.target.onload = null
            }
        });
    });

    let config = {attributes: true, attributeFilter: ["src"], childList: true, characterData: true}
    observer.observe(ele, config);
}


function post_process_captcha(text) {
    let tmp = text
    // 容易混淆 0o 1l 2z 9g
    switch (MODE) {
        case "num":
            tmp = tmp
                .replaceAll(/[ouOD。Q口]/g, "0")
                .replaceAll(/[，,\-li]/g, "1")
                .replaceAll(/[己已="]/g, "2")
                .replaceAll("a", "3")
                .replaceAll(/[bG"]/g, "6")
                .replaceAll(/[yz>"]/gi, "7")
                .replaceAll(/[&B日"]/g, "8")
                .replaceAll("g", "9")
            break
        case "letter":
            tmp = tmp
                .replaceAll(/[0。口]/g, "o")
                .replaceAll("口", "o")
                .replaceAll("1", "l")
                .replaceAll("2", "z")
                .replaceAll("6", "b")
                .replaceAll(/[&8日"]/g, "B")
                .replaceAll("9", "g")
            break
        case "mix":
        default:
            break
    }
    if (tmp !== text) {
        console.log("post_process_captcha", text, "==>", tmp);
    }
    return tmp;
}


window.onload = function () {
    chrome.storage.sync.get({"debug": false})
        .then(config => {
            DEBUG = config.debug
            console.log("debug", DEBUG)
        })

    chrome.storage.sync.get({"mode": "mix"})
        .then(config => {
            MODE = config.mode
            DEBUG && console.log("mode", MODE)
        })

    let verifycode_ele = get_elements(image_condition, "img")
    console.log("_______loaded_____ image config", fill_config, verifycode_ele)
    if (fill_config.selector && fill_config.img) {
        let ele = find_element(fill_config.img);
        // cache img for speed up
        found_captcha_img = ele
        found_captcha_input = find_element(fill_config.selector);
        if (fill_config.target) {
            found_target = find_element(fill_config.target);
            console.info("===>found_target", found_target)
        }
        if (verifycode_ele && ele.tagName !== "CANVAS") {
            verifycode_ele.push(ele)
        }
        console.log("_______loaded_____ image very_code_nodes", verifycode_ele)
    }
    DEBUG && console.log("_______loaded_____ find", verifycode_ele)
    chrome.storage.sync.get({"reco_on_load": false})
        .then(config => {
            verifycode_ele.forEach(el => {
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
            })
        })
}

function getEleTransform(el) {
    const style = window.getComputedStyle(el, null);
    let transform = style.getPropertyValue("-webkit-transform") || style.getPropertyValue("-moz-transform") || style.getPropertyValue("-ms-transform") || style.getPropertyValue("-o-transform") || style.getPropertyValue("transform") || "null";
    return transform && transform.split(",")[4];
}

function moveSideCaptcha(target, btn, distance) {
    if (distance === 0) {
        console.log("distance", distance);
        return;
    }
    let variable = null;
    let targetStyle = window.getComputedStyle(target, null);
    let targetLeft = Number(targetStyle.left.replace("px", "")) || 0;
    let targetParentStyle = window.getComputedStyle(target.parentNode, null);
    let targetParentLeft = Number(targetParentStyle.left.replace("px", "")) || 0;
    let transform = getEleTransform(target);
    let targetTransform = Number(transform) || 0;
    let parentTransform = getEleTransform(target.parentNode);
    let targetParentTransform = Number(parentTransform) || 0;

    console.log("+++++", targetLeft, targetParentLeft, targetTransform, targetParentTransform)

    let rect = btn.getBoundingClientRect();
    let x = rect.x;
    let y = rect.y;

    btn.dispatchEvent(mouseEvent("mousedown", x, y));

    let dx = 0;
    let dy = 0;
    let interval = setInterval(function () {
        let _x = x + dx;
        let _y = y + dy;
        let mousemove = mouseEvent("mousemove", _x, -_y)
        btn.dispatchEvent(mousemove);
        btn.dispatchEvent(mousemove);

        let newTargetLeft = Number(targetStyle.left.replace("px", "")) || 0;
        let newTargetParentLeft = Number(targetParentStyle.left.replace("px", "")) || 0;
        let newTargetTransform = Number(transform) || 0;
        let newTargetParentTransform = Number(parentTransform) || 0;
        console.log("mouse event diff", newTargetLeft - targetLeft, newTargetParentLeft - targetParentLeft, newTargetTransform - targetTransform, newTargetParentTransform - targetParentTransform)

        if (newTargetLeft !== targetLeft) {
            variable = newTargetLeft;
        } else if (newTargetParentLeft !== targetParentLeft) {
            variable = newTargetParentLeft;
        } else if (newTargetTransform !== targetTransform) {
            variable = newTargetTransform;
        } else if (newTargetParentTransform !== targetParentTransform) {
            variable = newTargetParentTransform;
        }
        if (variable >= distance) {
            console.log("mouse event variable", variable, distance)
            clearInterval(interval);
            let mouseup = mouseEvent("mouseup", _x, _y);
            setTimeout(() => {
                btn.dispatchEvent(mouseup);
            }, Math.ceil(Math.random() * 2000));
        } else {
            if (dx >= distance - 20) {
                dx += Math.ceil(Math.random() * 2);
            } else {
                dx += Math.ceil(Math.random() * 10);
            }
            let sign = Math.random() > 0.5 ? -1 : 1;
            dy += Math.ceil(Math.random() * 3 * sign);
        }
    }, 10);
    setTimeout(() => {
        clearInterval(interval);
    }, 10000);
}

function mouseEvent(type, screenX, screenY, clientX, clientY) {
    let mouseEvent = document.createEvent("MouseEvents");
    mouseEvent.initMouseEvent(type, true, true, document.defaultView, 0,
        screenX, screenY, clientX || screenX, clientY || screenY,
        false, false, false, false, 0, null);

    return mouseEvent
}
