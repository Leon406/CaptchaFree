<h4 align="center">Visitors :eyes:</h4>

<p align="center"><img src="https://profile-counter.glitch.me/Leon406_CaptchaFree/count.svg" alt="BurpSuiteCN-Release :: Visitor's Count" />
 <img width=0 height=0 src="https://profile-counter.glitch.me/Leon406/count.svg" alt="Leon406:: Visitor's Count" />

</p>



## 安装

pip install  -r requirements.txt

## 启动
python OcrServer.py


## Linux 后台运行脚本

bash startOcrServer

## 配置修改

修改配置文件service.conf

| 参数           | 说明                                                         |
| -------------- | ------------------------------------------------------------ |
| listen         | 服务监听ip                                                   |
| port           | 服务端口                                                     |
| worker_threads | 识别引擎的初始的数量,默认3, 越多占用内存越大,视服务器配置而定 |
| limit_interval | 限制时间间隔,默认3600s                                       |
| rate_limit     | 限制时间间隔内,允许的请求次数,默认10次                       |
| white_ips      | 请求白名单,默认本地服务器,可以添加调用ip,多个用 , 分隔       |



## 配套插件
[chrome-plugin目录](./chrome-plugin )

## Linux 错误及解决
### [ImportError: libGL.so](https://www.cnblogs.com/mrneojeep/p/16252044.html) 
- ubuntu

```
apt-get update && apt-get install libgl1
```

-   CentOS、RHEL、Fedora 或其他使用 的 linux 发行版yum

```
yum install mesa-libGL -y
```



