const definitions = {
  INVALID_INPUT:[400,'输入参数不合法'], NOT_FOUND:[404,'对象不存在，请刷新列表'],
  BUSY:[409,'同步或操作进行中，请结束后再保存'],
  REVISION_CONFLICT:[409,'设置已变化，请重新打开编辑'],
  DUPLICATE_SOURCE:[409,'此来源已经接入'],
  STORAGE_FAILED:[500,'未能确认保存，请重新加载设置'],
};
export class SafeError extends Error {
  constructor(code, field) {
    const [status,message]=definitions[code]; super(message);
    this.code=code; this.status=status; if(field)this.field=field;
  }
}
export function publicError(error) {
  if(!(error instanceof SafeError))return null;
  const [status,message]=definitions[error.code];
  return {status,body:{error:{code:error.code,message,...(error.field?{field:error.field}:{})}}};
}

// Only the local ICS FilePort ENOENT boundary constructs this error.
export class SourcePathNotFoundError extends Error {
  constructor() { super('找不到该文件，请确认路径'); this.code='PATH_NOT_FOUND'; }
}
export function sourceReadError(error) {
  return error instanceof SourcePathNotFoundError
    ? {code:'PATH_NOT_FOUND',message:'找不到该文件，请确认路径'} : null;
}
