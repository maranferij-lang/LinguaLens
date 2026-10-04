// Тестове середовище з власним часовим поясом — для перевірок, що
// залежать від місцевого часу (серія на межі доби, перехід на зимовий час
// 25.10.2026 у Києві). process.env.TZ усередині тесту не діє: jest дає
// тестові копію process.env, а пояс V8 слухає лише справжню. Тому пояс
// ставимо тут, у процесі воркера, на час одного файлу, і повертаємо
// попередній, щойно файл закінчився: наступний тест у тому ж воркері живе
// в UTC, як і всі.
//
// У файлі тесту:
//   /**
//    * @jest-environment ./jest.tzEnvironment.js
//    * @jest-environment-options {"timezone": "Europe/Kyiv"}
//    */
const { testEnvironment } = require('jest-expo/jest-preset');
const Base = require(testEnvironment);

module.exports = class TimezoneEnvironment extends Base {
  constructor(config, context) {
    super(config, context);
    this.timezone = config.projectConfig.testEnvironmentOptions?.timezone || 'UTC';
  }

  async setup() {
    this.previousTz = process.env.TZ;
    process.env.TZ = this.timezone;
    await super.setup();
  }

  async teardown() {
    if (this.previousTz === undefined) delete process.env.TZ;
    else process.env.TZ = this.previousTz;
    await super.teardown();
  }
};
