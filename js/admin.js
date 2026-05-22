window.WQAuth = window.WQAuth || {};

WQAuth.loadPendingApprovals = async function () {

  const { data, error } = await window.supabase
    .from("profiles")
    .select("*")
    .eq("status", "pending");

  if (error) {
    console.error(error);
    return;
  }

  const approvalList = document.getElementById("approvalList");

  approvalList.style.display = "block";

  if (!data.length) {
    approvalList.innerHTML = "<p>No pending approvals</p>";
    return;
  }

  approvalList.innerHTML = data.map(user => `
    <div style="border:1px solid #ccc;padding:10px;margin-bottom:10px;border-radius:8px;">
      <strong>${user.username}</strong><br>
      ${user.email}<br>
      Role: ${user.role}<br><br>

      <button onclick="WQAuth.approveUser('${user.id}')">
        Approve
      </button>
    </div>
  `).join("");
};

WQAuth.approveUser = async function(userId) {

  const { error } = await window.supabase
    .from("profiles")
    .update({
      status: "approved",
      approved_at: new Date().toISOString()
    })
    .eq("id", userId);

  if (error) {
    alert(error.message);
    return;
  }

  alert("User approved");

  WQAuth.loadPendingApprovals();
};