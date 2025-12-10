import { createApp } from "vue";
import "./style.css";
import App from "./App.vue";
import ElementPlus from "element-plus";
import "element-plus/dist/index.css";
import "animate.css";
import router from "./router";
import { useUserStore } from "@/stores/user";

import { createPinia } from "pinia";
const app = createApp(App);
const pinia = createPinia();
app.use(pinia);
app.use(router);

app.use(ElementPlus);
app.mount("#app");
// 页面刷新时尝试获取用户信息
const userStore = useUserStore();
userStore.fetchUserInfo();
