# from gevent import monkey
# from gevent.pywsgi import WSGIServer
#
# monkey.patch_all()

import configparser
import json
import logging
import os
import platform
import re
import threading
import time

import ddddocr
import requests
from flask import Flask, request

# ImportError: libGL.so 解决方案  https://www.cnblogs.com/mrneojeep/p/16252044.html
# ubuntu
# apt-get update && apt-get install libgl1
#  CentOS、RHEL、Fedora 或其他使用 的 linux 发行版yum
# yum install mesa-libGL -y

# 读取service.conf配置文件
config = configparser.ConfigParser()
config.read('service.conf', encoding='utf-8')
service = config['service']

# 日志设置
LOG_TO_CONSOLE = False
log_file = 'log.txt'
logger = logging.getLogger('Ocr')
fmt_str = "%(asctime)s [%(lineno)d] %(levelname)s - %(message)s"
logging.basicConfig(level=logging.INFO,
                    filename=log_file,
                    filemode="a",
                    format=fmt_str,
                    datefmt="%Y-%m-%d %H:%M:%S")

logging.getLogger("requests").setLevel(logging.WARNING)

if LOG_TO_CONSOLE:
    console_handler = logging.StreamHandler()
    logger.addHandler(console_handler)

app = Flask(__name__)

ddddocr_list = []
ddddocr_state = []

USERS = {}
RESTRICT_USERS = {}
black_users = set()
black_users.add("1.1.1.1")
white_ips = ["127.0.0.1"]
ips = service['white_ips'].split(",")
if "" in ips:
    ips.remove("")
white_ips.extend(ips)
# 限制请求时间间隔
LIMIT_INTERVAL = int(service['limit_interval'])
RATE_LIMIT = int(service['rate_limit'])


def init():
    t = int(service['worker_threads'])
    for i in range(t):
        ddddocr_list.append(ddddocr.DdddOcr(show_ad=False))
        ddddocr_state.append(0)
        os.system('cls' if "window" in platform.platform().lower() else "clear")

    logger.info("init success")


def get_ddddocr():
    for i in range(len(ddddocr_state)):
        if ddddocr_state[i] == 0:
            ddddocr_state[i] = 1
            return i
    return -1


def destroy_ddddocr(i):
    ddddocr_state[i] = 0
    return 0


def check_limit(ip):
    if ip in USERS and ip not in white_ips:
        current_user = USERS[ip]
        logger.debug(f"current {current_user}")
        if ip in black_users:
            raise Exception("You request too much, and now in blacklist!!!")
        if time.time() - current_user["time"] < LIMIT_INTERVAL:
            if current_user["count"] < RATE_LIMIT:
                current_user["count"] += 1
            else:
                logger.info(f"black ip {ip}")
                if ip in RESTRICT_USERS:
                    RESTRICT_USERS[ip] = RESTRICT_USERS[ip] + 1
                else:
                    RESTRICT_USERS[ip] = 1
                logger.info(f"black  {RESTRICT_USERS}")
                if RESTRICT_USERS[ip] > RATE_LIMIT:
                    black_users.add(ip)
                raise Exception("request limit!!! Try again in %s min" % int(LIMIT_INTERVAL / 60))
        else:
            reset_limit(ip)
    else:
        reset_limit(ip)


def reset_limit(ip):
    USERS[ip] = {
        "time": time.time(),
        "count": 0,
    }
    if ip in RESTRICT_USERS:
        RESTRICT_USERS.pop(ip)
    logger.info(f"users {ip} {USERS}")


# 支持 参数 url, base64,file
@app.route('/ocr', methods=['POST'])
def ocr():
    try:
        if "x-requested-with" not in request.headers and "X-Requested-With" not in request.headers:
            return json.dumps({'code': False, 'msg': '请求错误'})
        xrw = request.headers.getlist("x-requested-with") or request.headers.getlist("X-Requested-With")
        if xrw[0] != "XMLHttpRequest":
            return json.dumps({'code': False, 'msg': 'error'})
        ip = parse_ip(request)
        check_limit(ip)
        if "base64" in request.form:
            b64 = request.form['base64']
            b64 = b64[b64.find(',') + 1:]
            return classify(b64, ip)
        if "url" in request.form:
            pre_request = requests.head(request.form['url'], timeout=2)
            length = 0
            if "Content-Length" in pre_request.headers:
                length = pre_request.headers["Content-Length"]
            elif "content-length" in pre_request.headers:
                length = pre_request.headers["content-length"]

            # 校验图片大小
            if length:
                if int(length) < 64 * 1024:
                    return classify(requests.get(request.form['url'], timeout=3).content, ip)
                else:
                    return json.dumps({'code': False, 'msg': '文件大于64k'})
            else:
                return classify(requests.get(request.form['url'], timeout=3).content, ip)

        file = request.files['file']
        if file:
            filename = file.filename
            # 判断是不是图片
            if filename.split('.')[-1].lower() not in ['jpg', 'png', 'jpeg']:
                return json.dumps({'code': False, 'msg': '这不是有效的图片'})
        else:
            return json.dumps({'code': False, 'msg': '服务器错误'})

        return classify(file.read(), ip)
    except Exception as e:
        logger.error(e)
        return json.dumps({'status': False, 'msg': str(e)})


@app.route('/unlock/<unlock_ip>', methods=['PUT'])
def unlock(unlock_ip):
    ip = parse_ip(request)
    if ip in white_ips and unlock_ip in black_users:
        black_users.remove(unlock_ip)
        reset_limit(unlock_ip)
        logger.info(f"after unlock black {RESTRICT_USERS}")
        return json.dumps({'status': True, 'msg': "unlock success", 'ip': ip})
    else:
        return json.dumps({'status': False, 'msg': "Server Error!", 'ip': ip})


@app.route('/rate/<rate_count>', methods=['PUT'])
def rate(rate_count):
    ip = parse_ip(request)
    rate_count = int(rate_count)
    if rate_count < 0:
        return json.dumps({'status': False, 'msg': "wrong rate", 'ip': ip})
    else:
        global RATE_LIMIT
        # 不限制,
        if rate_count == 0:
            rate_count = LIMIT_INTERVAL * 10
        if ip in white_ips and rate_count != RATE_LIMIT:
            logger.info(f"old= {RATE_LIMIT}, new= {rate_count}")
            RATE_LIMIT = rate_count
            return json.dumps({'status': True, 'msg': "success", 'ip': ip, 'rate': RATE_LIMIT})
        else:
            return json.dumps({'status': False, 'msg': "sever error", 'ip': ip, 'rate': RATE_LIMIT})


@app.route('/users', methods=['GET'])
def user():
    return json.dumps({'status': True,
                       'msg': "Success",
                       'user': USERS,
                       'restrict': RESTRICT_USERS,
                       'black': list(black_users)})


def classify(content, ip):
    i = get_ddddocr()
    if i == -1:
        return json.dumps({'status': False, 'msg': '没有空闲的OCR线程'})

    logger.debug(f"已调度线程 {i}")
    start = time.time()
    try:
        data = post_process(ddddocr_list[i].classification(content))
        logger.info(f"reco==> {data}")
        end = time.time()
        return json.dumps({'status': True, 'msg': 'SUCCESS', 'result': data, 't': round(end - start, 3), 'ip': ip,
                           'remain': RATE_LIMIT - USERS[ip]["count"]})
    except Exception as e:
        logger.error(f"线程{i} {e}")
    finally:
        destroy_ddddocr(i)
        logger.debug(f"线程{i}已释放")


def parse_ip(req):
    ip = req.remote_addr
    if "X-Forwarded-For" in req.headers:
        ip = req.headers.getlist("X-Forwarded-For")[0]
    return ip


regex_chinese = re.compile("[\u4e00-\u9fa5]+")
regex_line = re.compile("""^[-)(/一_>=<+,]|[-)(/一_>=<+,]$""")


def post_process(data: str) -> str:
    """处理识别后的字符串,干扰线"""
    after = regex_line.sub("", data)
    chinese = regex_chinese.findall(data)
    if chinese:
        count = 0
        for i in chinese:
            count += len(i)
        #  不支持中英混合, 比例小于1/4删除
        if count / len(data) < 0.26:
            after = regex_chinese.sub("", after)

    if after != data:
        logger.info(f"process {data} ==> {after} ")
    return after


if __name__ == '__main__':
    threading.Thread(target=init).start()
    # 原生不支持多线程,调试使用
    # app.run(host=service['listen'], port=service['port'], debug=False)

    # gevent WSGI方式, 必须在最顶部导包并patch, monkey.patch_all(),否则会堵塞
    # WSGIServer((service['listen'], int(service['port'])), app).serve_forever()

    # 改用waitress WSGI
    # from waitress import serve
    # serve(app, host=service['listen'], port=int(service['port']))

    # 内置 WSGI
    from wsgiref.simple_server import make_server

    server = make_server(service['listen'], int(service['port']), app)
    server.serve_forever()
