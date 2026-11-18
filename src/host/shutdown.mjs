/** The same shutdown path is used by the host and exercised without DSH. */
export async function shutdown({remove,unmount,domain}) {
  remove();
  await unmount(); // drains actions, then core/source work, then releases module resources
  await domain.close();
}
